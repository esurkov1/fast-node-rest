# Simple Express Router

[![npm version](https://badge.fury.io/js/simple-express-router.svg)](https://badge.fury.io/js/simple-express-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Легковесная обёртка над Express.js для быстрого создания REST API с встроенной обработкой ошибок, форматированием ответов и рекурсивной регистрацией маршрутов.

## 🚀 Особенности

- **Декларативное определение маршрутов** - Определяй API через простые объекты
- **Автоматическая обработка ошибок** - Единообразные ответы на ошибки
- **Рекурсивная структура маршрутов** - Вложенные маршруты любой глубины
- **Поддержка middleware** - Добавляй middleware на любой уровень
- **Унифицированные ответы** - Консистентный формат JSON ответов
- **TypeScript-friendly** - Четкая структура для типизации
- **Минимальные зависимости** - Только Express.js и cookie-parser

## 📦 Установка

```bash
npm install simple-express-router
```

## 🏁 Быстрый старт

```javascript
const { server } = require('simple-express-router');

const routes = {
    health: {
        method: 'get',
        handler: async (req, res) => {
            return { status: 'OK', timestamp: new Date().toISOString() };
        }
    },
    
    api: {
        users: {
            method: 'get',
            handler: async (req, res) => {
                return { users: [{ id: 1, name: 'John' }] };
            }
        }
    }
};

server({
    port: 3000,
    prefix: '',
    routes
});
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
const { server } = require('simple-express-router');

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
const { server } = require('simple-express-router');

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

Если нашли баг или хотите предложить улучшение, создайте [issue](https://github.com/esurkov1/simple-router/issues).

## 📚 Дополнительные ресурсы

- [Express.js документация](https://expressjs.com/)
- [Node.js документация](https://nodejs.org/docs/)
- [npm публикация](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages) 