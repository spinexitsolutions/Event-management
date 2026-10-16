import { ACTIVE_BOOKING_STATUSES } from '@maison/shared';
import type { Tx } from '../config/db';
import { AppError } from '../lib/AppError';
import { isoDate } from '../lib/dates';

/**
 * Prisma `where` fragment matching bookings whose [eventDate, eventEndDate ?? eventDate] range overlaps [from, to].
 * Dates are DATE columns (UTC midnight); both ends are inclusive.
 */
export function bookingOverlapWhere(from: Date, to: Date) {
  return {
    eventDate: { lte: to },
    OR: [{ eventEndDate: { gte: from } }, { eventEndDate: null, eventDate: { gte: from } }],
  };
}

/** Active bookings on the venue overlapping the range (excluding one booking, e.g. the one being edited). */
export async function findVenueConflicts(tx: Tx, venueId: string, from: Date, to: Date | null | undefined, excludeBookingId?: string) {
  const end = to && to > from ? to : from;
  return tx.booking.findMany({
    where: {
      venueId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      archived: false,
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      ...bookingOverlapWhere(from, end),
    },
    select: { id: true, reference: true, title: true, eventDate: true, eventEndDate: true, status: true },
    orderBy: { eventDate: 'asc' },
  });
}

/**
 * Throws 409 CONFLICT when the venue is exclusive and another active booking overlaps the date range.
 * A null end date means a single-day event. Call inside the same transaction that writes the booking.
 */
export async function assertVenueAvailable(
  tx: Tx,
  venueId: string | null | undefined,
  eventDate: Date,
  eventEndDate: Date | null | undefined,
  excludeBookingId?: string,
) {
  if (!venueId) return;
  const venue = await tx.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true, exclusive: true } });
  if (!venue) throw AppError.notFound('Venue');
  if (!venue.exclusive) return;
  const conflicts = await findVenueConflicts(tx, venueId, eventDate, eventEndDate, excludeBookingId);
  if (conflicts.length) {
    const c = conflicts[0];
    throw AppError.conflict(`${venue.name} is already booked for ${c.title} (${c.reference}) on ${isoDate(c.eventDate)}${c.eventEndDate ? ` – ${isoDate(c.eventEndDate)}` : ''}`, {
      conflicts: conflicts.map((b) => ({ ...b, eventDate: isoDate(b.eventDate), eventEndDate: isoDate(b.eventEndDate) })),
    });
  }
}
