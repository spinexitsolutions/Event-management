import { Router } from 'express';
import { authRouter } from './modules/auth.routes';
import { publicRouter } from './modules/public.routes';
import { cmsRouter } from './modules/cms.routes';
import { mediaRouter } from './modules/media.routes';
import { collectionRouter, COLLECTIONS } from './modules/collections';
import { clientsRouter, inquiriesRouter, staffDirectoryRouter } from './modules/crm.routes';
import { quotationsRouter } from './modules/quotations.routes';
import { bookingsRouter } from './modules/bookings.routes';
import { financeRouter } from './modules/finance.routes';
import { portalRouter } from './modules/portal.routes';
import { reportsRouter } from './modules/reports.routes';
import { settingsRouter } from './modules/settings.routes';
import { opsRouter } from './routes.ops';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/portal', portalRouter);

// Admin — every router enforces its own permissions server-side.
apiRouter.use('/admin/cms', cmsRouter);
apiRouter.use('/admin/media', mediaRouter);
for (const key of Object.keys(COLLECTIONS)) apiRouter.use(`/admin/content/${key}`, collectionRouter(key));
apiRouter.use('/admin/inquiries', inquiriesRouter);
apiRouter.use('/admin/clients', clientsRouter);
apiRouter.use('/admin/staff-directory', staffDirectoryRouter);
apiRouter.use('/admin/quotations', quotationsRouter);
apiRouter.use('/admin/bookings', bookingsRouter);
apiRouter.use('/admin/finance', financeRouter);
apiRouter.use('/admin', reportsRouter);
apiRouter.use('/admin/settings', settingsRouter);
apiRouter.use(opsRouter);
