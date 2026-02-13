import { convexTable, date } from '../index';

describe('date() builder', () => {
  test('creates optional number validator by default', () => {
    const events = convexTable('events_date_builder_test', {
      startsAt: date(),
    });

    expect(events.validator).toBeDefined();
    expect((events as any).startsAt).toBeDefined();
  });

  test('supports notNull/date defaults in column config', () => {
    const now = new Date();
    const events = convexTable('events_date_builder_not_null_test', {
      startsAt: date().notNull().default(now),
    });

    const config = ((events as any).startsAt as any).config;
    expect(config.notNull).toBe(true);
    expect(config.default).toBe(now);
    expect(config.columnType).toBe('ConvexDate');
  });
});
