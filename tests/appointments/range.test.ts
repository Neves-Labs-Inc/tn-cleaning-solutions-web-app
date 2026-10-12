import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { appointmentsHref, parseAppointmentsQuery, type AppointmentsQuery } from '../../src/lib/appointments/overview.ts'
import {
  canShowMore,
  getRangeCopy,
  getReadRange,
  showMore,
  stepWeek,
  switchLayout,
  toCurrentWeek,
} from '../../src/lib/appointments/range.ts'

// A Sunday, so the business week starts today.
const BUSINESS_DATE = '2026-10-11'

const THIS_WEEK: AppointmentsQuery = {
  view: 'schedule',
  layout: 'week',
  from: null,
  weeks: 8,
  month: 10,
  year: 2026,
  showCancelled: false,
  clientId: '',
  jobId: '',
  status: 'all',
}

describe('parseAppointmentsQuery: range', () => {
  it('opens on the week layout for the business week when no params are given', () => {
    assert.deepEqual(parseAppointmentsQuery({}, BUSINESS_DATE), THIS_WEEK)
  })

  it('reads the business week from a mid-week business date', () => {
    const query = parseAppointmentsQuery({ from: '2026-10-11' }, '2026-10-15')

    assert.equal(query.from, null)
  })

  it('reads a Sunday week start and every layout', () => {
    assert.equal(parseAppointmentsQuery({ from: '2026-10-18' }, BUSINESS_DATE).from, '2026-10-18')
    assert.equal(parseAppointmentsQuery({ layout: 'month' }, BUSINESS_DATE).layout, 'month')
    assert.equal(parseAppointmentsQuery({ layout: 'list' }, BUSINESS_DATE).layout, 'list')
  })

  it("snaps a date that isn't a Sunday to its week's Sunday", () => {
    assert.equal(parseAppointmentsQuery({ from: '2026-10-22' }, BUSINESS_DATE).from, '2026-10-18')
    assert.equal(parseAppointmentsQuery({ from: '2027-01-01' }, BUSINESS_DATE).from, '2026-12-27')
  })

  it('reads a date in the business week as the business week', () => {
    assert.equal(parseAppointmentsQuery({ from: '2026-10-14' }, BUSINESS_DATE).from, null)
  })

  it('falls back to the business week and the week layout for bad or repeated values', () => {
    for (const from of ['2026-02-30', '2026-10-1', 'next week', '1999-12-26', '']) {
      assert.equal(parseAppointmentsQuery({ from }, BUSINESS_DATE).from, null, from)
    }
    assert.equal(parseAppointmentsQuery({ from: ['2026-10-18', '2026-10-25'] }, BUSINESS_DATE).from, null)
    assert.equal(parseAppointmentsQuery({ layout: 'calendar' }, BUSINESS_DATE).layout, 'week')
  })
})

describe('parseAppointmentsQuery: list extent', () => {
  it('reads a whole number of 8-week chunks up to the cap', () => {
    assert.equal(parseAppointmentsQuery({ weeks: '16' }, BUSINESS_DATE).weeks, 16)
    assert.equal(parseAppointmentsQuery({ weeks: '104' }, BUSINESS_DATE).weeks, 104)
  })

  it('falls back to 8 weeks for anything else', () => {
    for (const weeks of ['12', '0', '-8', '112', '16.0', '1e2', ' 16', '0x10', '']) {
      assert.equal(parseAppointmentsQuery({ weeks }, BUSINESS_DATE).weeks, 8, weeks)
    }
    assert.equal(parseAppointmentsQuery({ weeks: ['16', '24'] }, BUSINESS_DATE).weeks, 8)
  })
})

describe('appointmentsHref: range', () => {
  it('leaves out the week layout, the business week and the month', () => {
    assert.equal(appointmentsHref(THIS_WEEK), '/solutions/appointments')
  })

  it('keeps another week and the list layout', () => {
    assert.equal(
      appointmentsHref({ ...THIS_WEEK, layout: 'list', from: '2026-10-18' }),
      '/solutions/appointments?layout=list&from=2026-10-18'
    )
  })

  it('keeps a longer list extent and leaves out the default one', () => {
    assert.equal(appointmentsHref({ ...THIS_WEEK, layout: 'list', weeks: 16 }), '/solutions/appointments?layout=list&weeks=16')
  })

  it('keeps the month and year, not the week, in the month layout', () => {
    assert.equal(
      appointmentsHref({ ...THIS_WEEK, layout: 'month', from: '2026-10-18', weeks: 16, month: 3, year: 2025 }),
      '/solutions/appointments?layout=month&month=3&year=2025'
    )
  })

  it('round-trips through the parser with filters and Show cancelled', () => {
    const query: AppointmentsQuery = {
      ...THIS_WEEK,
      view: 'billed',
      layout: 'list',
      from: '2026-12-27',
      weeks: 24,
      showCancelled: true,
      clientId: 'smith',
      status: 'completed',
    }
    const params = Object.fromEntries(new URL(appointmentsHref(query), 'http://localhost').searchParams)

    assert.deepEqual(parseAppointmentsQuery(params, BUSINESS_DATE), query)
  })
})

describe('week steps', () => {
  it('moves the week start back and forward a week', () => {
    assert.equal(stepWeek(THIS_WEEK, -1, BUSINESS_DATE).from, '2026-10-04')
    assert.equal(stepWeek(THIS_WEEK, 1, BUSINESS_DATE).from, '2026-10-18')
    assert.equal(stepWeek({ ...THIS_WEEK, from: '2026-12-27' }, 1, BUSINESS_DATE).from, '2027-01-03')
  })

  it('lands on the business week as the default', () => {
    assert.equal(stepWeek({ ...THIS_WEEK, from: '2026-10-18' }, -1, BUSINESS_DATE).from, null)
  })

  it('returns to the business week and keeps everything else', () => {
    const query = { ...THIS_WEEK, layout: 'list' as const, from: '2026-11-15', clientId: 'smith', showCancelled: true }

    assert.deepEqual(toCurrentWeek(query), { ...query, from: null })
  })
})

describe('showMore', () => {
  it('extends the list by 8 weeks and keeps everything else', () => {
    const query = { ...THIS_WEEK, layout: 'list' as const, from: '2026-11-15', clientId: 'smith' }

    assert.deepEqual(showMore(query), { ...query, weeks: 16 })
    assert.equal(showMore({ ...query, weeks: 16 }).weeks, 24)
  })

  it('stops offering more at the cap', () => {
    assert.equal(canShowMore({ ...THIS_WEEK, weeks: 96 }), true)
    assert.equal(canShowMore({ ...THIS_WEEK, weeks: 104 }), false)
  })

  it('keeps the extent through Prev, Next and This week', () => {
    const query = { ...THIS_WEEK, weeks: 16 }

    assert.equal(stepWeek(query, 1, BUSINESS_DATE).weeks, 16)
    assert.equal(toCurrentWeek(query).weeks, 16)
  })
})

describe('switchLayout', () => {
  const NOVEMBER = { ...THIS_WEEK, layout: 'month' as const, month: 11 }

  it('keeps the week start between Week and List', () => {
    const week = { ...THIS_WEEK, from: '2026-11-15', clientId: 'smith' }

    assert.deepEqual(switchLayout(week, 'list', BUSINESS_DATE), { ...week, layout: 'list' })
  })

  it('opens the month containing the week start', () => {
    assert.deepEqual(switchLayout({ ...THIS_WEEK, from: '2026-11-29' }, 'month', BUSINESS_DATE), {
      ...THIS_WEEK,
      layout: 'month',
      month: 11,
      year: 2026,
    })
    const month = switchLayout({ ...THIS_WEEK, layout: 'list', from: '2026-12-27' }, 'month', BUSINESS_DATE)
    assert.deepEqual([month.month, month.year], [12, 2026])
  })

  it('opens the business month from the business week, even when the week starts in the month before', () => {
    assert.deepEqual(switchLayout(THIS_WEEK, 'month', '2026-10-02'), {
      ...THIS_WEEK,
      layout: 'month',
      month: 10,
      year: 2026,
    })
  })

  it('goes back to the default list extent in the Month layout', () => {
    assert.equal(switchLayout({ ...THIS_WEEK, layout: 'list', weeks: 24 }, 'month', BUSINESS_DATE).weeks, 8)
  })

  it("opens another month's first week, the one containing the 1st", () => {
    assert.deepEqual(switchLayout(NOVEMBER, 'week', BUSINESS_DATE), { ...THIS_WEEK, from: '2026-11-01' })
    assert.equal(switchLayout({ ...NOVEMBER, month: 12 }, 'list', BUSINESS_DATE).from, '2026-11-29')
  })

  it('opens the business week from the business month', () => {
    assert.deepEqual(switchLayout({ ...NOVEMBER, month: 10 }, 'list', '2026-10-28'), {
      ...THIS_WEEK,
      layout: 'list',
    })
  })

  it("leaves the query as it is when the layout doesn't change", () => {
    assert.deepEqual(switchLayout(NOVEMBER, 'month', BUSINESS_DATE), NOVEMBER)
  })
})

describe('getReadRange', () => {
  it('reads the list extent from the week start in the Week and List layouts', () => {
    assert.deepEqual(getReadRange(THIS_WEEK, '2026-10-15'), { from: '2026-10-11', to: '2026-12-05' })
    assert.deepEqual(getReadRange({ ...THIS_WEEK, layout: 'list', from: '2026-10-18', weeks: 16 }, BUSINESS_DATE), {
      from: '2026-10-18',
      to: '2027-02-06',
    })
  })

  it("reads the Month layout's month", () => {
    assert.deepEqual(getReadRange({ ...THIS_WEEK, layout: 'month', month: 2, year: 2028 }, BUSINESS_DATE), {
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })
})

describe('getRangeCopy', () => {
  it('names the list from its week start to the end of its extent', () => {
    assert.deepEqual(getRangeCopy({ ...THIS_WEEK, layout: 'list' }, BUSINESS_DATE), {
      heading: 'From Oct 11',
      phrase: 'from Oct 11 to Dec 5',
    })
    assert.equal(getRangeCopy({ ...THIS_WEEK, layout: 'list', weeks: 16 }, BUSINESS_DATE).phrase, 'from Oct 11 to Jan 30, 2027')
  })

  it('names the week by its dates', () => {
    assert.deepEqual(getRangeCopy(THIS_WEEK, BUSINESS_DATE), {
      heading: 'Oct 11 – 17, 2026',
      phrase: 'in the week of Oct 11',
    })
    assert.equal(getRangeCopy({ ...THIS_WEEK, from: '2026-09-27' }, BUSINESS_DATE).heading, 'Sep 27 – Oct 3, 2026')
    assert.equal(
      getRangeCopy({ ...THIS_WEEK, from: '2026-12-27' }, BUSINESS_DATE).heading,
      'Dec 27, 2026 – Jan 2, 2027'
    )
  })

  it('adds the year outside the business year', () => {
    const nextYear = { ...THIS_WEEK, from: '2027-01-03' }

    assert.equal(getRangeCopy(nextYear, BUSINESS_DATE).phrase, 'in the week of Jan 3, 2027')
    assert.deepEqual(getRangeCopy(nextYear, BUSINESS_DATE, 'list'), {
      heading: 'From Jan 3, 2027',
      phrase: 'from Jan 3, 2027 to Feb 27, 2027',
    })
  })

  it('names the month in the Month layout', () => {
    assert.deepEqual(getRangeCopy({ ...THIS_WEEK, layout: 'month', month: 3, year: 2025 }, BUSINESS_DATE), {
      heading: 'March 2025',
      phrase: 'in March 2025',
    })
  })
})
