import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class UnversionedRedirectMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const originalUrl = req.originalUrl;

    // Exclude root API info, health checks, docs, and already versioned paths
    const excludedPrefixes = ['/v1', '/v2', '/api/docs', '/health'];
    const isExcluded = excludedPrefixes.some((prefix) =>
      originalUrl.startsWith(prefix),
    );

    if (!isExcluded && originalUrl !== '/') {
      // Set deprecation headers for unversioned access
      res.setHeader('Deprecation', 'true');
      res.setHeader('Warning', '299 - "Unversioned API paths are deprecated. Use /v1/..."');

      // Internal rewrite to /v1/ route preserving query params
      req.url = `/v1${originalUrl}`;
    }

    next();
  }
}