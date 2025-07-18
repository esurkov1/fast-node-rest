const FastNodeREST = require('../index.js');

// Настройки JWT
const JWT_CONFIG = {
    JWT_SECRET: 'your-super-secret-access-key-change-in-production',
    JWT_REFRESH: 'your-super-secret-refresh-key-change-in-production', 
    JWT_SERVICE: 'your-super-secret-service-key-change-in-production',
    JWT_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '7d'
};

// Имитация базы данных пользователей
const users = new Map([
    ['admin', { id: 1, username: 'admin', password: 'admin123', role: 'admin' }],
    ['user', { id: 2, username: 'user', password: 'user123', role: 'user' }]
]);

// Черный список refresh токенов (в продакшене использовать Redis)
const revokedTokens = new Set();

// Создание сервера с JWT конфигурацией
const server = new FastNodeREST({
    port: process.env.PORT || 3000,
    prefix: '',
    enableLogging: true,
    cors: {
        origin: process.env.NODE_ENV === 'production' ? 
            'https://yourapp.com' : 
            ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true
    },
    // Встроенный health check с JWT информацией
    healthCheck: true,
    healthCheckData: {
        environment: process.env.NODE_ENV || 'development',
        features: ['jwt', 'auth', 'refresh-tokens', 'service-tokens'],
        jwtConfigured: !!(JWT_CONFIG.JWT_SECRET && JWT_CONFIG.JWT_REFRESH)
    },
    ...JWT_CONFIG // Передаем JWT настройки
});

// Middleware для логирования аутентификации
const authLogMiddleware = (req, res, next) => {
    const method = req.method;
    const path = req.path;
    
    if (req.user) {
        console.log(`[AUTH] User ${req.user.user_id} accessed ${method} ${path}`);
        if (req.user.tokenRefreshed) {
            console.log(`[AUTH] Token refreshed for user ${req.user.user_id}`);
        }
    } else if (req.service) {
        console.log(`[AUTH] Service '${req.service.name}' accessed ${method} ${path}`);
    }
    
    next();
};

// Определение маршрутов
const routes = {
    // Health check без аутентификации
    health: {
        method: 'get',
        handler: async () => ({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            auth: 'JWT Auth Example Server'
        })
    },

    // API routes
    api: {
        v1: {
            // Публичные маршруты аутентификации
            auth: {
                // Вход в систему
                login: {
                    method: 'post',
                    handler: async (req, res) => {
                        const { username, password } = req.body;
                        
                        if (!username || !password) {
                            const error = new Error('Username and password are required');
                            error.status = 400;
                            error.field = !username ? 'username' : 'password';
                            throw error;
                        }

                        const user = users.get(username);
                        if (!user || user.password !== password) {
                            const error = new Error('Invalid credentials');
                            error.status = 401;
                            throw error;
                        }

                        // Генерируем токены используя встроенные методы
                        const accessToken = server.jwt.issueAccessToken(user.id, { role: user.role });
                        const refreshToken = server.jwt.issueRefreshToken(user.id, { role: user.role });

                        // Устанавливаем refresh token в httpOnly cookie
                        res.cookie('refreshToken', refreshToken, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'strict',
                            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
                        });

                        return {
                            message: 'Login successful',
                            accessToken,
                            user: {
                                id: user.id,
                                username: user.username,
                                role: user.role
                            }
                        };
                    }
                },

                // Выход из системы
                logout: {
                    method: 'post',
                    middlewares: [server.middleware.auth, authLogMiddleware],
                    handler: async (req, res) => {
                        // Получаем refresh token из cookie
                        const refreshToken = req.cookies?.refreshToken;
                        if (refreshToken) {
                            // Добавляем в черный список
                            revokedTokens.add(refreshToken);
                        }

                        // Очищаем cookie
                        res.clearCookie('refreshToken');

                        return { message: 'Logout successful' };
                    }
                },

                // Обновление access token
                refresh: {
                    method: 'post',
                    handler: async (req, res) => {
                        const refreshToken = req.cookies?.refreshToken;
                        
                        if (!refreshToken) {
                            const error = new Error('Refresh token not found');
                            error.status = 401;
                            throw error;
                        }

                        if (revokedTokens.has(refreshToken)) {
                            res.clearCookie('refreshToken');
                            const error = new Error('Refresh token has been revoked');
                            error.status = 401;
                            throw error;
                        }

                        const decoded = server.jwt.verifyToken(refreshToken, JWT_CONFIG.JWT_REFRESH);
                        if (!decoded?.user_id || decoded?.type !== 'refresh') {
                            res.clearCookie('refreshToken');
                            const error = new Error('Invalid refresh token');
                            error.status = 401;
                            throw error;
                        }

                        // Генерируем новый access token
                        const newAccessToken = server.jwt.issueAccessToken(decoded.user_id, { 
                            role: decoded.role 
                        });

                        return {
                            message: 'Token refreshed successfully',
                            accessToken: newAccessToken
                        };
                    }
                }
            },

            // Защищённые пользовательские маршруты
            user: {
                // Профиль пользователя (с auto-refresh)
                profile: {
                    method: 'get',
                    middlewares: [server.middleware.auth, authLogMiddleware],
                    handler: async (req, res) => {
                        const user = Array.from(users.values()).find(u => u.id === req.user.user_id);
                        
                        return {
                            user: {
                                id: user.id,
                                username: user.username,
                                role: user.role
                            },
                            tokenInfo: req.user.tokenRefreshed ? 
                                'Token was automatically refreshed' : 
                                'Token is valid'
                        };
                    }
                },

                // Обновление профиля (строгая проверка токена без refresh)
                update: {
                    method: 'put',
                    middlewares: [server.middleware.authUserOnly, authLogMiddleware],
                    handler: async (req, res) => {
                        const { username } = req.body;
                        
                        if (!username) {
                            const error = new Error('Username is required');
                            error.status = 400;
                            error.field = 'username';
                            throw error;
                        }

                        return {
                            message: 'Profile updated successfully',
                            user: { id: req.user.user_id, username }
                        };
                    }
                }
            },

            // Административные маршруты
            admin: {
                users: {
                    method: 'get',
                    middlewares: [server.middleware.auth, authLogMiddleware],
                    handler: async (req, res) => {
                        // Проверяем права администратора
                        if (req.user.payload.role !== 'admin') {
                            const error = new Error('Admin access required');
                            error.status = 403;
                            throw error;
                        }

                        return {
                            users: Array.from(users.values()).map(u => ({
                                id: u.id,
                                username: u.username,
                                role: u.role
                            }))
                        };
                    }
                }
            },

            // Сервисные маршруты (для межсервисного взаимодействия)
            service: {
                status: {
                    method: 'get',
                    middlewares: [server.middleware.authServiceOnly],
                    handler: async (req, res) => {
                        return {
                            message: `Service ${req.service.name} authenticated successfully`,
                            timestamp: new Date().toISOString(),
                            service: req.service.name
                        };
                    }
                }
            },

            // Демонстрация токенов
            tokens: {
                // Создание service токена (только для админов)
                'create-service': {
                    method: 'post',
                    middlewares: [server.middleware.auth, authLogMiddleware],
                    handler: async (req, res) => {
                        if (req.user.payload.role !== 'admin') {
                            const error = new Error('Admin access required');
                            error.status = 403;
                            throw error;
                        }

                        const { serviceName } = req.body;
                        if (!serviceName) {
                            const error = new Error('Service name is required');
                            error.status = 400;
                            error.field = 'serviceName';
                            throw error;
                        }

                        const serviceToken = server.jwt.issueServiceToken(serviceName);
                        
                        return {
                            message: 'Service token created successfully',
                            serviceToken,
                            serviceName
                        };
                    }
                }
            }
        }
    }
};

// Устанавливаем маршруты
server.config.routes = routes;

// Запуск сервера
async function startServer() {
    try {
        await server.start();

        console.log(`
🔐 JWT Auth Example Server started on http://localhost:${server.config.port}

Test Users:
- admin/admin123 (admin role)
- user/user123 (user role)

Available endpoints:
- GET    /health-check (built-in health check)
- GET    /health
- POST   /api/v1/auth/login
- POST   /api/v1/auth/logout (requires auth)
- POST   /api/v1/auth/refresh
- GET    /api/v1/user/profile (requires auth + auto-refresh)
- PUT    /api/v1/user/update (requires valid token, no refresh)
- GET    /api/v1/admin/users (requires admin role)
- GET    /api/v1/service/status (requires service token)
- POST   /api/v1/tokens/create-service (requires admin role)

Example requests:
# Login
curl -c cookies.txt -X POST http://localhost:${server.config.port}/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}'

# Use access token (replace YOUR_TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" \\
  http://localhost:${server.config.port}/api/v1/user/profile

# Auto-refresh with cookie
curl -b cookies.txt http://localhost:${server.config.port}/api/v1/user/profile

# Create service token (as admin)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -X POST http://localhost:${server.config.port}/api/v1/tokens/create-service \\
  -H "Content-Type: application/json" \\
  -d '{"serviceName":"my-service"}'

# Use service token
curl -H "Authorization: Bearer YOUR_SERVICE_TOKEN" \\
  http://localhost:${server.config.port}/api/v1/service/status
`);

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.stop().then(() => {
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer(); 