import { Router, type RequestHandler } from 'express';

export const seoRouter = Router();
export const renderSpaShell = (_file: string): RequestHandler => (_req, _res, next) => next();
