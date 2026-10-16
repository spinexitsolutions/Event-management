import { Router } from 'express';
import { authRouter } from './modules/auth.routes';
import { publicRouter } from './modules/public.routes';
import { cmsRouter } from './modules/cms.routes';
import { mediaRouter } from './modules/media.routes';
import { collectionRouter, COLLECTIONS } from './modules/collections';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicRouter);

// Admin (each router enforces its own permissions)
apiRouter.use('/admin/cms', cmsRouter);
apiRouter.use('/admin/media', mediaRouter);
for (const key of Object.keys(COLLECTIONS)) apiRouter.use(`/admin/content/${key}`, collectionRouter(key));
