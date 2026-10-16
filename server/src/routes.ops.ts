import { Router } from 'express';
import { vendorsRouter } from './modules/vendors.routes';
import { resourcesRouter } from './modules/resources.routes';
import { tasksRouter } from './modules/tasks.routes';
import { calendarRouter } from './modules/calendar.routes';
import { guestsRouter, rsvpPublicRouter } from './modules/guests.routes';
import { staffRouter } from './modules/staff.routes';
import { notificationsRouter, outboxRouter } from './modules/notifications.routes';

/** Operations APIs (vendors, inventory, tasks, calendar, guests, staff, notifications). Each router enforces its own permissions. */
export const opsRouter = Router();

opsRouter.use('/public', rsvpPublicRouter);
opsRouter.use('/notifications', notificationsRouter);
opsRouter.use('/admin/vendors', vendorsRouter);
opsRouter.use('/admin/resources', resourcesRouter);
opsRouter.use('/admin/tasks', tasksRouter);
opsRouter.use('/admin/calendar', calendarRouter);
opsRouter.use('/admin/guests', guestsRouter);
opsRouter.use('/admin/staff', staffRouter);
opsRouter.use('/admin/outbox', outboxRouter);
