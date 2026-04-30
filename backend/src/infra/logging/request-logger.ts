import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

// Express middleware for logging HTTP requests
export function requestLogger(req: Request, res: Response, next: NextFunction) {
	const start = Date.now();
	res.on('finish', () => {
		const duration = Date.now() - start;
		logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
			method: req.method,
			url: req.originalUrl,
			status: res.statusCode,
			duration,
			ip: req.ip,
			userAgent: req.get('user-agent'),
		});
	});
	next();
}
