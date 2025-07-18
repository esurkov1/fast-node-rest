# Fast Node REST

[![npm version](https://badge.fury.io/js/fast-node-rest.svg)](https://badge.fury.io/js/fast-node-rest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Быстрый и легковесный фреймворк для создания REST API на Node.js с декларативными маршрутами, автоматической обработкой ошибок и встроенными middleware.

## 🚀 Особенности

- **Монолитный класс** - Все возможности в одном простом классе
- **Декларативное определение маршрутов** - Определяй API через простые объекты
- **Автоматическая обработка ошибок** - Единообразные ответы на ошибки
- **Рекурсивная структура маршрутов** - Вложенные маршруты любой глубины
- **Поддержка middleware** - Добавляй middleware на любой уровень
- **JWT аутентификация** - Встроенная JWT с support refresh токенов
- **Service-to-service auth** - Отдельные токены для межсервисного взаимодействия
- **Auto token refresh** - Автоматическое обновление access токенов
- **Унифицированные ответы** - Консистентный формат JSON ответов
- **TypeScript-friendly** - Четкая структура для типизации
- **Минимальные зависимости** - Express.js, cookie-parser, jsonwebtoken

## 📦 Установка

```bash
npm install fast-node-rest
```

## 🆕 Что изменилось в v1.3.0

**BREAKING CHANGE:** Убрана legacy API совместимость для упрощения архитектуры.

### Миграция с v1.2.0 на v1.3.0

**Было (v1.2.0):**
```javascript
const { server, sendSuccess, sendError, AuthMiddleware } = require('fast-node-rest');
const auth = new AuthMiddleware({...});
server({ port: 3000, routes });
```

**Стало (v1.3.0):**
```javascript
const FastNodeREST = require('fast-node-rest');

// Простой запуск
const app = await FastNodeREST.create({ port: 3000, routes });

// Или полный контроль с JWT
const server = new FastNodeREST({ 
    port: 3000, 
    JWT_SECRET: 'secret',
    routes 
});
server.middleware.auth; // Встроенная аутентификация
await server.start();
```

## 🏁 Быстрый старт

### Вариант 1: Минимальный сервер

```javascript
const FastNodeREST = require('fast-node-rest');

const routes = {
    health: {
        method: 'get',
        handler: async () => ({ status: 'OK', timestamp: new Date().toISOString() })
    }
};

// Создание и запуск в одну строку
const app = await FastNodeREST.create({ port: 3000, routes });
```

### Вариант 2: С JWT аутентификацией

```javascript
const FastNodeREST = require('fast-node-rest');

// После создания сервера middleware доступны  
const server = new FastNodeREST({
    port: 3000,
    JWT_SECRET: 'your-secret',
    routes: {
        hello: {
            method: 'get',
            handler: async () => ({ message: 'Hello World!' })
        }
    }
});

// Добавляем защищенные маршруты после создания
server.config.routes.protected = {
    method: 'get',
    middlewares: [server.middleware.auth], // Встроенный JWT
    handler: async (req) => ({ user: req.user })
};

await server.start();
console.log('Server running!');
```

### Вариант 3: Полный контроль

```javascript
const FastNodeREST = require('fast-node-rest');

const server = new FastNodeREST({
    port: 3000,
    prefix: '/api/v1',
    enableLogging: true,
    JWT_SECRET: 'secret',
    JWT_REFRESH: 'refresh-secret',
    cors: { origin: 'https://myapp.com' }
});

// Доступ ко всем возможностям
server.jwt.issueAccessToken(userId);
server.middleware.auth; // Auto-refresh JWT
server.response.success(res, data);

await server.start();
```

## 📖 API Документация

### `server(options)`

Создаёт и запускает Express сервер с определёнными маршрутами.

#### Параметры

- **port** `(number)` - Порт для запуска сервера
- **prefix** `(string, optional)` - Префикс для всех маршрутов (по умолчанию: '')
- **routes** `(object)` - Объект с определением маршрутов

#### Пример

```javascript
server({
    port: 3000,
    prefix: '/api/v1',
    routes: routesObject
});
```

### Структура маршрута

Каждый маршрут может содержать следующие поля:

```javascript
{
    method: 'get|post|put|delete|patch',  // HTTP метод (по умолчанию: 'post')
    handler: async (req, res) => {},      // Обработчик маршрута
    middlewares: [middleware1, middleware2] // Массив middleware (опционально)
}
```

### `responseHandler(res, data, error, extra, status)`

Утилита для формирования единообразных ответов.

#### Параметры

- **res** `(Response)` - Express response объект
- **data** `(object, optional)` - Данные для успешного ответа
- **error** `(object, optional)` - Объект ошибки
- **extra** `(object, optional)` - Дополнительные поля
- **status** `(number, optional)` - HTTP статус код (по умолчанию: 200)

## 🎯 Примеры использования

### Базовый CRUD API

```javascript
const { server } = require('fast-node-rest');

const routes = {
    api: {
        v1: {
            posts: {
                // GET /api/v1/posts - получить все посты
                method: 'get',
                handler: async (req, res) => {
                    const { page = 1, limit = 10 } = req.query;
                    return {
                        posts: [
                            { id: 1, title: 'Post 1', content: 'Content 1' },
                            { id: 2, title: 'Post 2', content: 'Content 2' }
                        ],
                        pagination: { page: parseInt(page), limit: parseInt(limit) }
                    };
                },

                // POST /api/v1/posts/create - создать пост
                create: {
                    method: 'post',
                    handler: async (req, res) => {
                        const { title, content } = req.body;
                        
                        if (!title || !content) {
                            const error = new Error('Title and content are required');
                            error.status = 400;
                            throw error;
                        }

                        return {
                            message: 'Post created successfully',
                            post: { id: Date.now(), title, content }
                        };
                    }
                },

                // GET /api/v1/posts/:id - получить пост по ID
                ':id': {
                    method: 'get',
                    handler: async (req, res) => {
                        const { id } = req.params;
                        return {
                            post: { id: parseInt(id), title: `Post ${id}` }
                        };
                    }
                }
            }
        }
    }
};

server({ port: 3000, routes });
```

### Аутентификация и middleware

```javascript
const { server } = require('fast-node-rest');

// Middleware для проверки токена
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

const routes = {
    auth: {
        login: {
            method: 'post',
            handler: async (req, res) => {
                const { username, password } = req.body;
                
                if (username === 'admin' && password === 'password') {
                    return {
                        token: 'fake-jwt-token',
                        user: { id: 1, username, role: 'admin' }
                    };
                }
                
                const error = new Error('Invalid credentials');
                error.status = 401;
                throw error;
            }
        }
    },

    protected: {
        profile: {
            method: 'get',
            middlewares: [authMiddleware, logMiddleware],
            handler: async (req, res) => {
                return { user: req.user };
            }
        }
    }
};

server({ port: 3000, routes });
```

### Обработка ошибок

```javascript
const routes = {
    api: {
        users: {
            ':id': {
                method: 'get',
                handler: async (req, res) => {
                    const { id } = req.params;
                    
                    if (!id || isNaN(id)) {
                        const error = new Error('Invalid user ID');
                        error.status = 400;
                        error.field = 'id';
                        throw error;
                    }

                    if (parseInt(id) > 1000) {
                        const error = new Error('User not found');
                        error.status = 404;
                        throw error;
                    }

                    return {
                        user: { id: parseInt(id), name: `User ${id}` }
                    };
                }
            }
        }
    }
};
```

## 📝 Формат ответов

### Успешный ответ

```json
{
  "user": {
    "id": 1,
    "name": "John Doe"
  },
  "message": "Operation completed successfully"
}
```

### Ответ с ошибкой

```json
{
  "error": {
    "message": "Validation failed",
    "field": "email",
    "code": "INVALID_EMAIL"
  }
}
```

## 🧪 Тестирование

Запустить пример:

```bash
npm start
```

Тестовые запросы:

```bash
# Проверка здоровья
curl http://localhost:3000/health

# Логин
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123"}'

# Получить профиль (требует авторизации)
curl http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer your-token"

# Получить посты с пагинацией
curl "http://localhost:3000/api/v1/posts?page=1&limit=5"
```

## 🔐 JWT Аутентификация

Fast Node REST включает мощный `AuthMiddleware` класс для JWT аутентификации с поддержкой:

- **Access токены** - Короткоживущие токены для API доступа
- **Refresh токены** - Долгоживущие токены для обновления access токенов  
- **Service токены** - Отдельные токены для межсервисного взаимодействия
- **Auto-refresh** - Автоматическое обновление истекших access токенов

### Быстрый старт с JWT

```javascript
const FastNodeREST = require('fast-node-rest');

// Создание сервера с JWT настройками
const server = new FastNodeREST({
    port: 3000,
    JWT_SECRET: 'your-access-token-secret',
    JWT_REFRESH: 'your-refresh-token-secret', 
    JWT_SERVICE: 'your-service-token-secret',
    routes: {
        auth: {
            login: {
                method: 'post',
                handler: async (req, res) => {
                    const { username, password } = req.body;
                    // Проверка логина/пароля...
                    
                    const accessToken = server.jwt.issueAccessToken(userId);
                    const refreshToken = server.jwt.issueRefreshToken(userId);
                    
                    // Установить refresh token в httpOnly cookie
                    res.cookie('refreshToken', refreshToken, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
                    });
                    
                    return { accessToken, user: { id: userId } };
                }
            }
        },
        
        protected: {
            profile: {
                method: 'get',
                middlewares: [server.middleware.auth], // Авто-refresh включен
                handler: async (req) => ({ user: req.user })
            },
            
            settings: {
                method: 'put', 
                middlewares: [server.middleware.authUserOnly], // Строгая проверка без refresh
                handler: async () => ({ message: 'Settings updated' })
            }
        },
        
        service: {
            status: {
                method: 'get',
                middlewares: [server.middleware.authServiceOnly], // Только service токены
                handler: async (req) => ({ service: req.service.name })
            }
        }
    }
});

await server.start();
```

### Типы middleware

- `server.middleware.auth` - Основной middleware с auto-refresh функциональностью
- `server.middleware.authUserOnly` - Только пользовательские токены, без auto-refresh  
- `server.middleware.authServiceOnly` - Только service токены для межсервисного взаимодействия

### JWT утилиты

- `server.jwt.issueAccessToken(userId, payload)` - Создание access токена
- `server.jwt.issueRefreshToken(userId, payload)` - Создание refresh токена
- `server.jwt.issueServiceToken(serviceName, payload)` - Создание service токена
- `server.jwt.verifyToken(token, secret)` - Проверка токена

### Запуск примеров

```bash
npm run demo     # Демонстрация всех возможностей
npm run auth     # Полный JWT example сервер
npm run auth:dev # JWT с nodemon
npm start        # Базовый example
```

Готовые endpoints в JWT примере:
- `POST /api/v1/auth/login` - Вход в систему
- `POST /api/v1/auth/refresh` - Обновление access токена  
- `GET /api/v1/user/profile` - Профиль с auto-refresh
- `POST /api/v1/tokens/create-service` - Создание service токенов

## 🔧 Конфигурация

### Настройки сервера

```javascript
const config = {
    port: process.env.PORT || 3000,
    prefix: process.env.API_PREFIX || '/api/v1',
    routes: yourRoutes
};

server(config);
```

### Переменные окружения

```bash
PORT=3000
API_PREFIX=/api/v1
NODE_ENV=production
```

## 📋 Требования

- Node.js >= 14.0.0
- Express.js ^4.18.0

## 🤝 Участие в разработке

1. Форкни репозиторий
2. Создай ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммить изменения (`git commit -m 'Add amazing feature'`)
4. Пуш в ветку (`git push origin feature/amazing-feature`)
5. Открой Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - смотри файл [LICENSE](LICENSE) для деталей.

## 🐛 Баги и предложения

Если нашли баг или хотите предложить улучшение, создайте [issue](https://github.com/esurkov1/fast-node-rest/issues).

## 📚 Дополнительные ресурсы

- [Express.js документация](https://expressjs.com/)
- [Node.js документация](https://nodejs.org/docs/)
- [npm публикация](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages) 