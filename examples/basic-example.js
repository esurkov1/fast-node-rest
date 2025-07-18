const { server } = require('../index.js');

// Middleware для проверки авторизации
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        const error = new Error('Authorization required');
        error.status = 401;
        throw error;
    }
    req.user = { id: 1, name: 'John Doe' };
    next();
};

// Middleware для логирования
const logMiddleware = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
};

// Определение маршрутов
const routes = {
    // Простой GET маршрут
    health: {
        method: 'get',
        handler: async (req, res) => {
            return { status: 'OK', timestamp: new Date().toISOString() };
        }
    },

    // API с вложенными маршрутами
    api: {
        v1: {
            // Публичные маршруты
            auth: {
                login: {
                    method: 'post',
                    handler: async (req, res) => {
                        const { username, password } = req.body;
                        
                        if (!username || !password) {
                            const error = new Error('Username and password required');
                            error.status = 400;
                            error.field = !username ? 'username' : 'password';
                            throw error;
                        }

                        return {
                            token: 'fake-jwt-token',
                            user: { id: 1, username, role: 'user' }
                        };
                    }
                },
                
                register: {
                    method: 'post',
                    handler: async (req, res) => {
                        const { username, email, password } = req.body;
                        
                        if (!username || !email || !password) {
                            const error = new Error('All fields are required');
                            error.status = 400;
                            throw error;
                        }

                        return {
                            message: 'User registered successfully',
                            user: { id: Date.now(), username, email }
                        };
                    }
                }
            },

            // Защищённые маршруты
            users: {
                profile: {
                    method: 'get',
                    middlewares: [authMiddleware],
                    handler: async (req, res) => {
                        return {
                            user: req.user,
                            settings: { theme: 'dark', notifications: true }
                        };
                    }
                },

                update: {
                    method: 'put',
                    middlewares: [authMiddleware, logMiddleware],
                    handler: async (req, res) => {
                        const { name, email } = req.body;
                        
                        return {
                            message: 'User updated successfully',
                            user: { ...req.user, name, email }
                        };
                    }
                }
            },

            // CRUD операции для постов
            posts: {
                // Получить все посты
                method: 'get',
                handler: async (req, res) => {
                    const { page = 1, limit = 10 } = req.query;
                    
                    return {
                        posts: [
                            { id: 1, title: 'First Post', content: 'Hello world!' },
                            { id: 2, title: 'Second Post', content: 'Another post' }
                        ],
                        pagination: {
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total: 2
                        }
                    };
                },

                // Создать новый пост
                create: {
                    method: 'post',
                    middlewares: [authMiddleware],
                    handler: async (req, res) => {
                        const { title, content } = req.body;
                        
                        if (!title || !content) {
                            const error = new Error('Title and content are required');
                            error.status = 400;
                            throw error;
                        }

                        return {
                            message: 'Post created successfully',
                            post: {
                                id: Date.now(),
                                title,
                                content,
                                author: req.user.name,
                                createdAt: new Date().toISOString()
                            }
                        };
                    }
                },

                // Получить конкретный пост
                ':id': {
                    method: 'get',
                    handler: async (req, res) => {
                        const { id } = req.params;
                        
                        if (!id || isNaN(id)) {
                            const error = new Error('Invalid post ID');
                            error.status = 400;
                            throw error;
                        }

                        return {
                            post: {
                                id: parseInt(id),
                                title: `Post ${id}`,
                                content: `Content of post ${id}`,
                                createdAt: new Date().toISOString()
                            }
                        };
                    }
                }
            }
        }
    }
};

// Запуск сервера
const PORT = process.env.PORT || 3000;

server({
    port: PORT,
    prefix: '',
    routes
});

console.log(`
🚀 Server started on http://localhost:${PORT}

Available endpoints:
- GET  /health
- POST /api/v1/auth/login
- POST /api/v1/auth/register
- GET  /api/v1/users/profile (requires auth)
- PUT  /api/v1/users/update (requires auth)
- GET  /api/v1/posts
- POST /api/v1/posts/create (requires auth)
- GET  /api/v1/posts/:id

Example requests:
curl http://localhost:${PORT}/health
curl -X POST http://localhost:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"test","password":"123"}'
`); 