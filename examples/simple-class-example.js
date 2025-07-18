const FastNodeREST = require('../index.js');

// ===== ПРИМЕР 1: Минимальный сервер =====

console.log('=== EXAMPLE 1: Minimal Server ===');

const simpleRoutes = {
    hello: {
        method: 'get',
        handler: async () => ({ message: 'Hello World!' })
    },
    
    echo: {
        method: 'post',
        handler: async (req) => ({ echo: req.body })
    }
};

// Создание и запуск в одну строку
FastNodeREST.create({
    port: 3051,
    routes: simpleRoutes,
    enableLogging: false
}).then(server => {
    console.log('✅ Simple server running on port 3051');
    
    // Остановка через 5 секунд для демо
    setTimeout(() => {
        server.stop().then(() => {
            console.log('✅ Simple server stopped\n');
            runExample2();
        });
    }, 2000);
});

// ===== ПРИМЕР 2: Сервер с JWT =====

function runExample2() {
    console.log('=== EXAMPLE 2: JWT Server ===');
    
    const server = new FastNodeREST({
        port: 3052,
        prefix: '/api',
        JWT_SECRET: 'demo-secret',
        JWT_REFRESH: 'demo-refresh-secret',
        enableLogging: false
    });

    // Устанавливаем маршруты после создания сервера
    server.config.routes = {
        // Публичный login
        login: {
            method: 'post',
            handler: async (req, res) => {
                const { username } = req.body;
                if (!username) {
                    const error = new Error('Username required');
                    error.status = 400;
                    throw error;
                }
                
                const accessToken = server.jwt.issueAccessToken(123, { username });
                const refreshToken = server.jwt.issueRefreshToken(123, { username });
                
                // Set refresh token in cookie
                res.cookie('refreshToken', refreshToken, { httpOnly: true });
                
                return { 
                    message: 'Login successful',
                    accessToken,
                    user: { id: 123, username }
                };
            }
        },
        
        // Защищенный профиль
        profile: {
            method: 'get',
            middlewares: [server.middleware.auth], // Встроенный JWT middleware
            handler: async (req) => ({
                message: 'Protected profile',
                user: req.user,
                refreshed: req.user.tokenRefreshed ? 'Token was auto-refreshed' : 'Token is valid'
            })
        }
    };
    
    server.start().then(() => {
        console.log('✅ JWT server running on port 3052');
        
        setTimeout(() => {
            server.stop().then(() => {
                console.log('✅ JWT server stopped\n');
                runExample3();
            });
        }, 2000);
    });
}

// ===== ПРИМЕР 3: Полные возможности =====

function runExample3() {
    console.log('=== EXAMPLE 3: Full Features ===');
    
    const server = new FastNodeREST({
        port: 3053,
        prefix: '/v1',
        enableLogging: true,
        JWT_SECRET: 'demo-secret',
        JWT_SERVICE: 'service-secret',
        cors: {
            origin: 'http://localhost:3000',
            credentials: true
        },
        security: true
    });

    // Устанавливаем маршруты после создания сервера
    server.config.routes = {
        // Nested routes
        users: {
            list: {
                method: 'get',
                handler: async () => ({ users: ['Alice', 'Bob'] })
            },
            
            ':id': {
                profile: {
                    method: 'get',
                    middlewares: [server.middleware.authUserOnly], // Строгая проверка без refresh
                    handler: async (req) => ({ 
                        profile: `User ${req.params.id}`,
                        authenticated: req.user.user_id 
                    })
                }
            }
        },
        
        // Service endpoint
        internal: {
            status: {
                method: 'get',
                middlewares: [server.middleware.authServiceOnly], // Только service токены
                handler: async (req) => ({ 
                    service: req.service.name,
                    status: 'healthy' 
                })
            }
        },
        
        // Token generation
        tokens: {
            service: {
                method: 'post',
                handler: async (req) => {
                    const { serviceName } = req.body;
                    const token = server.jwt.issueServiceToken(serviceName);
                    return { serviceToken: token };
                }
            }
        }
    };
    
    server.start().then(() => {
        console.log('✅ Full-featured server running on port 3053');
        console.log(`
📋 Available shortcuts:
- server.jwt.issueAccessToken(userId, payload)
- server.jwt.issueRefreshToken(userId, payload)  
- server.jwt.issueServiceToken(serviceName, payload)
- server.jwt.verifyToken(token, secret)
- server.middleware.auth (auto-refresh enabled)
- server.middleware.authUserOnly (strict user tokens)
- server.middleware.authServiceOnly (service tokens only)
- server.response.success(res, data, status)
- server.response.error(res, error, status)
`);

        // Demo API calls
        setTimeout(() => {
            console.log('\n🧪 Running demo API calls...');
            demoApiCalls().then(() => {
                server.stop().then(() => {
                    console.log('✅ Full-featured server stopped');
                    console.log('\n🎉 All examples completed!');
                });
            });
        }, 1000);
    });
}

// Демонстрация API вызовов
async function demoApiCalls() {
    const fetch = require('http').request;
    
    try {
        // Создание service токена
        console.log('1. Creating service token...');
        const serviceToken = await makeRequest('POST', 3053, '/v1/tokens/service', { serviceName: 'demo-service' });
        console.log('✅ Service token created');
        
        // Использование service токена
        console.log('2. Using service token...');
        await makeRequest('GET', 3053, '/v1/internal/status', null, {
            'Authorization': `Bearer ${serviceToken.serviceToken}`
        });
        console.log('✅ Service endpoint accessed');
        
    } catch (error) {
        console.log('⚠️ Demo API calls failed (expected in some environments)');
    }
}

// Простая функция для HTTP запросов
function makeRequest(method, port, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                ...(data && { 'Content-Length': Buffer.byteLength(data) })
            }
        };
        
        const req = require('http').request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch {
                    resolve(responseData);
                }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
} 