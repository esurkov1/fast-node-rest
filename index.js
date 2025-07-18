const express = require('express');
const cookieParser = require('cookie-parser');

// Универсальная функция формирования ответа
const responseHandler = (res, data = null, error = null, extra = {}, status = 200) => {
    const response = data ? { ...data } : { error: { message: error?.message || 'An error occurred', ...error, ...extra } };
    if (response.error?.status) delete response.error.status;
    res.status(status).json(response);
};

// Глобальный обработчик ошибок
const errorHandler = (err, req, res) => {
    const status = err.status || 500;
    const errorObject = { message: err.message || 'Internal Server Error', ...(err.field && { field: err.field }) };
    responseHandler(res, null, errorObject, { ...err.extra }, status);
};

// Обработчик несуществующих маршрутов
const notFoundHandler = (req, res) =>
    responseHandler(res, null, { message: "Route not found" }, { path: req.path }, 404);

// Основная функция сервера
const server = ({ port, prefix='', routes }) => {
    if (!port) throw new Error("Missing required configuration");

    const app = express();

    app.use(cookieParser());
    app.use(express.json());
    app.use((err, req, res, next) => {
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
            return responseHandler(res, null, { message: 'Invalid JSON syntax' }, {}, 400);
        }
        next(err); // передаем дальше остальные ошибки
    });


    // Функция добавления маршрута
    const addRoute = (path, { method = 'post', handler, middlewares = [] }) => {
        const validMethods = ['get', 'post', 'put', 'delete', 'patch'];
        if (!validMethods.includes(method.toLowerCase())) throw new Error(`Invalid method ${method}`);

        const fullPath = prefix + path;
        console.log(`[Route] ${method.toUpperCase()} ${fullPath}`);

        app[method.toLowerCase()](fullPath, ...middlewares, async (req, res) => {
            try {
                const result = await handler(req, res);
                responseHandler(res, result);
            } catch (error) {
                responseHandler(res, null, error, {}, error.status || 400);
            }
        });
    };

    // Рекурсивная регистрация маршрутов
    const parseRoutes = (routes, basePath = '') => {
        Object.entries(routes).forEach(([key, route]) => {
            const newPath = `${basePath}/${key}`.replace('//', '/');

            // Проверяем, что маршрут является объектом и содержит поле handler
            if (route && typeof route === 'object' && 'handler' in route) {
                if (typeof route.handler === 'function') {
                    addRoute(newPath, route);
                } else {
                    console.error(`Invalid handler at path: ${newPath}. Expected a function but got ${typeof route.handler}`);
                }
                return;
            }

            // Если маршрут является вложенным объектом, продолжаем рекурсию
            if (route && typeof route === 'object') {
                parseRoutes(route, newPath);
            } else {
                console.warn(`Invalid route detected at path: ${newPath}`);
            }
        });
    };

    parseRoutes(routes);
    app.use(notFoundHandler);
    app.use(errorHandler);
    app.listen(port, () => console.log(`Server running on port ${port}`));
};

module.exports = { server, responseHandler };