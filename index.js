const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

class FastNodeREST {
    constructor({
        port,
        prefix = '',
        routes = {},
        enableLogging = true,
        cors = true,
        security = true,
        jsonLimit = '10mb',
        // JWT настройки
        JWT_SECRET = null,
        JWT_REFRESH = null,
        JWT_SERVICE = null,
        JWT_EXPIRATION = '15m',
        JWT_REFRESH_EXPIRATION = '7d'
    } = {}) {
        this.config = {
            port,
            prefix,
            routes,
            enableLogging,
            cors,
            security,
            jsonLimit,
            JWT_SECRET,
            JWT_REFRESH,
            JWT_SERVICE,
            JWT_EXPIRATION,
            JWT_REFRESH_EXPIRATION
        };

        this.app = null;
        this.serverInstance = null;
    }

    // ===== UTILITY МЕТОДЫ =====
    
    sendSuccess(res, data = {}, status = 200) {
        res.status(status).json(data);
    }

    sendError(res, error, status = 400) {
        const errorResponse = {
            error: {
                message: error?.message || 'An error occurred',
                ...(error?.field && { field: error.field }),
                ...(error?.extra && error.extra)
            }
        };
        res.status(status).json(errorResponse);
    }

    // ===== JWT МЕТОДЫ =====

    verifyToken(token, secret) {
        if (!token || !secret) return null;
        
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            if (error.name !== 'TokenExpiredError' && error.name !== 'JsonWebTokenError') {
                console.error('[JWT] Token verification error:', error.message);
            }
            return null;
        }
    }

    issueAccessToken(user_id, additionalPayload = {}) {
        if (!this.config.JWT_SECRET) {
            throw new Error('JWT_SECRET not configured');
        }
        if (!user_id) throw new Error('user_id is required for token generation');
        
        const payload = { 
            user_id, 
            type: 'access',
            iat: Math.floor(Date.now() / 1000),
            ...additionalPayload 
        };
        
        return jwt.sign(payload, this.config.JWT_SECRET, { 
            expiresIn: this.config.JWT_EXPIRATION 
        });
    }

    issueRefreshToken(user_id, additionalPayload = {}) {
        if (!this.config.JWT_REFRESH) {
            throw new Error('JWT_REFRESH not configured');
        }
        if (!user_id) throw new Error('user_id is required for refresh token generation');
        
        const payload = { 
            user_id, 
            type: 'refresh',
            iat: Math.floor(Date.now() / 1000),
            ...additionalPayload 
        };
        
        return jwt.sign(payload, this.config.JWT_REFRESH, { 
            expiresIn: this.config.JWT_REFRESH_EXPIRATION 
        });
    }

    issueServiceToken(serviceName, additionalPayload = {}) {
        if (!this.config.JWT_SERVICE) {
            throw new Error('JWT_SERVICE secret not configured');
        }
        if (!serviceName) throw new Error('serviceName is required for service token generation');
        
        const payload = { 
            service: serviceName, 
            type: 'service',
            iat: Math.floor(Date.now() / 1000),
            ...additionalPayload 
        };
        
        return jwt.sign(payload, this.config.JWT_SERVICE, { 
            expiresIn: this.config.JWT_EXPIRATION 
        });
    }

    // ===== AUTH MIDDLEWARE =====

    auth = (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader?.startsWith('Bearer ')) {
            return this.sendError(res, { message: 'Missing or invalid Authorization header' }, 401);
        }
        
        const accessToken = authHeader.split(' ')[1];
        if (!accessToken) {
            return this.sendError(res, { message: 'Access token not provided' }, 401);
        }

        // 1. Проверяем service token (если настроен)
        if (this.config.JWT_SERVICE) {
            const serviceDecoded = this.verifyToken(accessToken, this.config.JWT_SERVICE);
            if (serviceDecoded?.service && serviceDecoded?.type === 'service') {
                req.service = { 
                    name: serviceDecoded.service,
                    payload: serviceDecoded
                };
                return next();
            }
        }

        // 2. Проверяем user access token
        const userDecoded = this.verifyToken(accessToken, this.config.JWT_SECRET);
        if (userDecoded?.user_id && userDecoded?.type === 'access') {
            req.user = { 
                user_id: userDecoded.user_id,
                payload: userDecoded
            };
            return next();
        }

        // 3. Если access token невалиден, пробуем refresh token
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return this.sendError(res, { message: 'Access token expired and no refresh token provided' }, 401);
        }

        const refreshDecoded = this.verifyToken(refreshToken, this.config.JWT_REFRESH);
        if (!refreshDecoded?.user_id || refreshDecoded?.type !== 'refresh') {
            res.clearCookie('refreshToken');
            return this.sendError(res, { message: 'Invalid refresh token. Please log in again' }, 401);
        }

        // Выпускаем новый access token
        try {
            const newAccessToken = this.issueAccessToken(refreshDecoded.user_id);
            res.setHeader('X-New-Access-Token', newAccessToken);
            
            req.user = { 
                user_id: refreshDecoded.user_id,
                payload: refreshDecoded,
                tokenRefreshed: true
            };
            
            return next();
        } catch (error) {
            console.error('[AUTH] Error generating new access token:', error);
            return this.sendError(res, { message: 'Failed to refresh access token' }, 500);
        }
    };

    authUserOnly = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return this.sendError(res, { message: 'User token required' }, 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = this.verifyToken(token, this.config.JWT_SECRET);
        
        if (!decoded?.user_id || decoded?.type !== 'access') {
            return this.sendError(res, { message: 'Invalid or expired user token' }, 401);
        }

        req.user = { 
            user_id: decoded.user_id,
            payload: decoded
        };
        next();
    };

    authServiceOnly = (req, res, next) => {
        if (!this.config.JWT_SERVICE) {
            return this.sendError(res, { message: 'Service authentication not configured' }, 500);
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return this.sendError(res, { message: 'Service token required' }, 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = this.verifyToken(token, this.config.JWT_SERVICE);
        
        if (!decoded?.service || decoded?.type !== 'service') {
            return this.sendError(res, { message: 'Invalid service token' }, 403);
        }

        req.service = { 
            name: decoded.service,
            payload: decoded
        };
        next();
    };

    // ===== SERVER MIDDLEWARE =====

    securityMiddleware = (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    };

    corsMiddleware = (options = {}) => (req, res, next) => {
        const {
            origin = '*',
            methods = 'GET,HEAD,PUT,PATCH,POST,DELETE',
            allowedHeaders = 'Content-Type,Authorization',
            credentials = false
        } = options;

        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', methods);
        res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
        
        if (credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        next();
    };

    errorHandler = (err, req, res, next) => {
        if (res.headersSent) {
            return next(err);
        }
        
        if (err.status >= 500 || !err.status) {
            console.error(`[ERROR] ${req.method} ${req.path}:`, err);
        }
        
        const status = err.status || 500;
        this.sendError(res, err, status);
    };

    notFoundHandler = (req, res) => {
        this.sendError(res, { 
            message: "Route not found", 
            extra: { path: req.path, method: req.method } 
        }, 404);
    };

    // ===== CORE SERVER МЕТОДЫ =====

    validateConfig() {
        if (!this.config.port || typeof this.config.port !== 'number') {
            throw new Error("Port must be a valid number");
        }
        if (!this.config.routes || typeof this.config.routes !== 'object') {
            throw new Error("Routes must be an object");
        }
    }

    addRoute(path, config) {
        const { method = 'post', handler, middlewares = [] } = config;
        
        if (!handler || typeof handler !== 'function') {
            throw new Error(`Handler must be a function for route: ${path}`);
        }

        const validMethods = ['get', 'post', 'put', 'delete', 'patch'];
        const normalizedMethod = method.toLowerCase();
        
        if (!validMethods.includes(normalizedMethod)) {
            throw new Error(`Invalid method: ${method}`);
        }

        const fullPath = (this.config.prefix + path).replace(/\/+/g, '/');
        
        if (this.config.enableLogging) {
            console.log(`[Route] ${normalizedMethod.toUpperCase()} ${fullPath}`);
        }

        this.app[normalizedMethod](fullPath, ...middlewares, async (req, res, next) => {
            try {
                const result = await handler(req, res);
                if (!res.headersSent) {
                    this.sendSuccess(res, result);
                }
            } catch (error) {
                next(error);
            }
        });
    }

    parseRoutes(routes, basePath = '') {
        Object.entries(routes).forEach(([key, route]) => {
            const newPath = `${basePath}/${key}`.replace(/\/+/g, '/');

            if (!route || typeof route !== 'object') {
                throw new Error(`Invalid route configuration at path: ${newPath}`);
            }

            if ('handler' in route) {
                this.addRoute(newPath, route);
                return;
            }

            this.parseRoutes(route, newPath);
        });
    }

    async start() {
        this.validateConfig();

        this.app = express();

        // Security middleware
        if (this.config.security) {
            this.app.use(this.securityMiddleware);
        }

        // CORS middleware
        if (this.config.cors) {
            const corsOptions = typeof this.config.cors === 'object' ? this.config.cors : {};
            this.app.use(this.corsMiddleware(corsOptions));
        }

        // Basic middleware
        this.app.use(cookieParser());
        this.app.use(express.json({ limit: this.config.jsonLimit }));
        
        // JSON error handling
        this.app.use((err, req, res, next) => {
            if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
                return this.sendError(res, { message: 'Invalid JSON syntax' }, 400);
            }
            next(err);
        });

        // Parse routes
        this.parseRoutes(this.config.routes);
        
        // Error handlers
        this.app.use(this.notFoundHandler);
        this.app.use(this.errorHandler);
        
        return new Promise((resolve, reject) => {
            this.serverInstance = this.app.listen(this.config.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Server running on port ${this.config.port}`);
                    resolve(this.serverInstance);
                }
            });
        });
    }

    async stop() {
        if (this.serverInstance) {
            return new Promise((resolve) => {
                this.serverInstance.close(() => {
                    console.log('Server stopped');
                    resolve();
                });
            });
        }
    }

    // ===== УДОБНЫЕ SHORTCUT МЕТОДЫ =====

    // Быстрый старт сервера
    static async create(config) {
        const server = new FastNodeREST(config);
        await server.start();
        return server;
    }

    // Middleware shortcuts для удобства
    get middleware() {
        return {
            auth: this.auth,
            authUserOnly: this.authUserOnly,
            authServiceOnly: this.authServiceOnly,
            security: this.securityMiddleware,
            cors: this.corsMiddleware
        };
    }

    // JWT shortcuts для удобства
    get jwt() {
        return {
            issueAccessToken: this.issueAccessToken.bind(this),
            issueRefreshToken: this.issueRefreshToken.bind(this),
            issueServiceToken: this.issueServiceToken.bind(this),
            verifyToken: this.verifyToken.bind(this)
        };
    }

    // Response shortcuts для удобства
    get response() {
        return {
            success: this.sendSuccess.bind(this),
            error: this.sendError.bind(this)
        };
    }
}

// Экспорт только монолитного класса
module.exports = FastNodeREST;