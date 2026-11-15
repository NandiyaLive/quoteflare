import { describe, expect, it } from 'vitest'
import { leadStatuses } from '#/db/schema'
import {
  addDays,
  defaultNextActionOn,
  localToday,
  messageLink,
  nextLeadState,
  parseProfileUrl,
  shouldOfferClose,
} from './leads'
import type { LeadAction, LeadState } from './leads'

const settings = { leadMaxFollowUps: 2 }
const today = '2026-11-16'
const now = new Date('2026-11-16T05:00:00Z')

const lead = (over: Partial<LeadState> = {}): LeadState => ({
  status: 'saved',
  nextActionOn: today,
  followUps: 0,
  unseenChecks: 0,
  lastContactedAt: null,
  closeReason: null,
  ...over,
})

const run = (state: LeadState | null, action: LeadAction) =>
  nextLeadState(state, action, today, settings)

const succeed = (state: LeadState | null, action: LeadAction) => {
  const result = run(state, action)
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('addDays and localToday', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
  })

  it('reads the date in the given time zone', () => {
    const t = new Date('2026-11-15T20:00:00Z')
    expect(localToday(t, 'Asia/Colombo')).toBe('2026-11-16')
    expect(localToday(t, 'UTC')).toBe('2026-11-15')
  })
})

describe('defaultNextActionOn', () => {
  // Asia/Colombo is UTC+5:30.
  it('is today before 12:00 local', () => {
    expect(defaultNextActionOn(new Date('2026-11-16T06:29:00Z'))).toBe(
      '2026-11-16',
    )
  })

  it('is tomorrow from 12:00 local', () => {
    expect(defaultNextActionOn(new Date('2026-11-16T06:30:00Z'))).toBe(
      '2026-11-17',
    )
  })

  it('uses the local date, not the UTC date', () => {
    // 23:00 UTC on the 15th is 04:30 on the 16th in Colombo.
    expect(defaultNextActionOn(new Date('2026-11-15T23:00:00Z'))).toBe(
      '2026-11-16',
    )
    // 20:00 UTC on the 15th is 01:30 on the 16th, still before noon.
    expect(defaultNextActionOn(new Date('2026-11-15T20:00:00Z'))).toBe(
      '2026-11-16',
    )
  })

  it('treats midnight as before noon', () => {
    expect(
      defaultNextActionOn(new Date('2026-11-15T18:30:00Z'), 'Asia/Colombo'),
    ).toBe('2026-11-16')
  })

  it('honours another time zone', () => {
    expect(
      defaultNextActionOn(new Date('2026-11-16T05:00:00Z'), 'America/New_York'),
    ).toBe('2026-11-16')
    expect(defaultNextActionOn(new Date('2026-11-16T17:00:00Z'), 'UTC')).toBe(
      '2026-11-17',
    )
  })
})

describe('nextLeadState, one test per lifecycle row', () => {
  it('Save: a new lead is saved with no counters', () => {
    const result = succeed(null, {
      type: 'save',
      now: new Date('2026-11-16T09:00:00Z'),
    })
    expect(result.state).toEqual({
      status: 'saved',
      nextActionOn: '2026-11-17',
      followUps: 0,
      unseenChecks: 0,
      lastContactedAt: null,
      closeReason: null,
    })
    expect(result.event).toEqual({ type: 'saved', detail: '' })
  })

  it('Save: before noon local the lead is due today', () => {
    const result = succeed(null, {
      type: 'save',
      now: new Date('2026-11-16T03:00:00Z'),
    })
    expect(result.state.nextActionOn).toBe('2026-11-16')
  })

  it('Mark messaged: saved to messaged, contact time set, due in 2 days', () => {
    const result = succeed(lead(), { type: 'mark_messaged', now })
    expect(result.state).toMatchObject({
      status: 'messaged',
      lastContactedAt: now.toISOString(),
      nextActionOn: '2026-11-18',
      followUps: 0,
      unseenChecks: 0,
    })
    expect(result.event.type).toBe('messaged')
  })

  it('Not seen yet: stays messaged, counts the check, due in 2 days', () => {
    const result = succeed(
      lead({ status: 'messaged', unseenChecks: 1, lastContactedAt: 'x' }),
      { type: 'not_seen' },
    )
    expect(result.state).toMatchObject({
      status: 'messaged',
      unseenChecks: 2,
      nextActionOn: '2026-11-18',
      lastContactedAt: 'x',
    })
    expect(result.event.type).toBe('checked_unseen')
  })

  it('Seen, no reply: messaged to seen, due in 3 days', () => {
    const result = succeed(lead({ status: 'messaged' }), {
      type: 'seen_no_reply',
    })
    expect(result.state).toMatchObject({
      status: 'seen',
      nextActionOn: '2026-11-19',
    })
    expect(result.event.type).toBe('checked_seen')
  })

  it('Mark followed up: seen to messaged, counters and contact time updated', () => {
    const result = succeed(
      lead({ status: 'seen', followUps: 1, unseenChecks: 2 }),
      { type: 'mark_followed_up', now },
    )
    expect(result.state).toMatchObject({
      status: 'messaged',
      followUps: 2,
      unseenChecks: 0,
      lastContactedAt: now.toISOString(),
      nextActionOn: '2026-11-19',
    })
    expect(result.event.type).toBe('followed_up')
  })

  it.each(['messaged', 'seen'] as const)(
    'They replied: %s to replied, due tomorrow',
    (status) => {
      const result = succeed(lead({ status }), { type: 'replied' })
      expect(result.state).toMatchObject({
        status: 'replied',
        nextActionOn: '2026-11-17',
      })
      expect(result.event.type).toBe('replied')
    },
  )

  it('Won: replied to won, no next action', () => {
    const result = succeed(lead({ status: 'replied' }), { type: 'won' })
    expect(result.state).toMatchObject({ status: 'won', nextActionOn: null })
    expect(result.event.type).toBe('won')
  })

  it.each(['saved', 'messaged', 'seen', 'replied'] as const)(
    'Close: %s to closed with the reason, no next action',
    (status) => {
      const result = succeed(lead({ status, followUps: 2 }), {
        type: 'close',
        reason: 'no_reply',
      })
      expect(result.state).toMatchObject({
        status: 'closed',
        closeReason: 'no_reply',
        nextActionOn: null,
        followUps: 2,
      })
      expect(result.event).toEqual({ type: 'closed', detail: 'no_reply' })
    },
  )

  it.each(['won', 'closed'] as const)(
    'Reopen: %s to saved, due today, counters kept',
    (status) => {
      const result = succeed(
        lead({
          status,
          nextActionOn: null,
          followUps: 2,
          unseenChecks: 1,
          lastContactedAt: 'x',
          closeReason: status === 'closed' ? 'bad_fit' : null,
        }),
        { type: 'reopen' },
      )
      expect(result.state).toEqual({
        status: 'saved',
        nextActionOn: today,
        followUps: 2,
        unseenChecks: 1,
        lastContactedAt: 'x',
        closeReason: null,
      })
      expect(result.event.type).toBe('reopened')
    },
  )

  it.each(['saved', 'messaged', 'seen', 'replied'] as const)(
    'Reschedule: %s keeps its status and takes the chosen date',
    (status) => {
      const result = succeed(lead({ status, followUps: 1 }), {
        type: 'reschedule',
        date: '2026-12-01',
      })
      expect(result.state).toMatchObject({
        status,
        nextActionOn: '2026-12-01',
        followUps: 1,
      })
      expect(result.event).toEqual({
        type: 'rescheduled',
        detail: '2026-12-01',
      })
    },
  )

  it('does not mutate the lead it was given', () => {
    const before = lead({ status: 'seen' })
    const snapshot = { ...before }
    succeed(before, { type: 'mark_followed_up', now })
    expect(before).toEqual(snapshot)
  })
})

describe('nextLeadState, invalid transitions', () => {
  const actions: Record<string, LeadAction> = {
    save: { type: 'save', now },
    mark_messaged: { type: 'mark_messaged', now },
    not_seen: { type: 'not_seen' },
    seen_no_reply: { type: 'seen_no_reply' },
    mark_followed_up: { type: 'mark_followed_up', now },
    replied: { type: 'replied' },
    won: { type: 'won' },
    close: { type: 'close', reason: 'bad_fit' },
    reopen: { type: 'reopen' },
    reschedule: { type: 'reschedule', date: '2026-12-01' },
  }
  const allowed: Record<string, readonly string[]> = {
    save: [],
    mark_messaged: ['saved'],
    not_seen: ['messaged'],
    seen_no_reply: ['messaged'],
    mark_followed_up: ['seen'],
    replied: ['messaged', 'seen'],
    won: ['replied'],
    close: ['saved', 'messaged', 'seen', 'replied'],
    reopen: ['won', 'closed'],
    reschedule: ['saved', 'messaged', 'seen', 'replied'],
  }

  const cases = Object.keys(actions).flatMap((name) =>
    leadStatuses
      .filter((status) => !allowed[name].includes(status))
      .map((status) => [name, status] as const),
  )

  it.each(cases)('rejects %s on a %s lead', (name, status) => {
    const result = run(lead({ status }), actions[name])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/\w/)
  })

  it('says why "Seen, no reply" fails on a saved lead', () => {
    expect(run(lead({ status: 'saved' }), actions.seen_no_reply)).toEqual({
      ok: false,
      error: 'Cannot mark as seen a lead that is saved.',
    })
  })

  it('returns no state or event when it fails', () => {
    const result = run(lead({ status: 'saved' }), actions.won)
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('event')
  })

  it('rejects saving a lead that exists', () => {
    expect(run(lead(), actions.save).ok).toBe(false)
  })

  it('rejects any other action on a lead that does not exist', () => {
    expect(run(null, actions.mark_messaged).ok).toBe(false)
  })

  it('rejects an unknown close reason', () => {
    const result = run(lead(), {
      type: 'close',
      reason: 'rude' as never,
    })
    expect(result.ok).toBe(false)
  })

  it.each(['2026-13-01', '2026-02-30', 'tomorrow', '', '2026-1-5'])(
    'rejects the reschedule date %j',
    (date) => {
      expect(run(lead(), { type: 'reschedule', date }).ok).toBe(false)
    },
  )

  it('rejects an invalid today', () => {
    expect(nextLeadState(lead(), { type: 'replied' }, 'now', settings).ok).toBe(
      false,
    )
  })
})

describe('walking one lead through the lifecycle', () => {
  it('follows messaged, not seen, seen, followed up, replied, won', () => {
    let state = succeed(null, { type: 'save', now }).state
    const steps: [LeadAction, string][] = [
      [{ type: 'mark_messaged', now }, 'messaged'],
      [{ type: 'not_seen' }, 'messaged'],
      [{ type: 'seen_no_reply' }, 'seen'],
      [{ type: 'mark_followed_up', now }, 'messaged'],
      [{ type: 'replied' }, 'replied'],
      [{ type: 'won' }, 'won'],
    ]
    const types: string[] = ['saved']
    for (const [action, status] of steps) {
      const result = succeed(state, action)
      expect(result.state.status).toBe(status)
      state = result.state
      types.push(result.event.type)
    }
    expect(types).toEqual([
      'saved',
      'messaged',
      'checked_unseen',
      'checked_seen',
      'followed_up',
      'replied',
      'won',
    ])
    expect(state.nextActionOn).toBeNull()
  })
})

describe('shouldOfferClose', () => {
  it('is false for a fresh lead', () => {
    expect(shouldOfferClose(lead({ status: 'messaged' }), settings)).toBe(false)
  })

  it('is true at the follow-up limit', () => {
    expect(
      shouldOfferClose(lead({ status: 'seen', followUps: 2 }), settings),
    ).toBe(true)
  })

  it('follows the setting', () => {
    expect(
      shouldOfferClose(lead({ status: 'seen', followUps: 2 }), {
        leadMaxFollowUps: 3,
      }),
    ).toBe(false)
  })

  it('is true after 2 unseen checks', () => {
    expect(
      shouldOfferClose(lead({ status: 'messaged', unseenChecks: 2 }), settings),
    ).toBe(true)
  })

  it('is false for replied, won and closed leads', () => {
    for (const status of ['replied', 'won', 'closed'] as const) {
      expect(shouldOfferClose(lead({ status, followUps: 5 }), settings)).toBe(
        false,
      )
    }
  })
})

describe('parseProfileUrl', () => {
  const parsed = (input: string) => {
    const result = parseProfileUrl(input)
    if (!result.ok) throw new Error(result.error)
    return result
  }

  it('gives the same key for an Instagram URL and an @handle', () => {
    const a = parsed('https://www.instagram.com/Studio_X/?igsh=abc')
    const b = parsed('@studio_x')
    expect(a.profileKey).toBe('instagram:studio_x')
    expect(b.profileKey).toBe(a.profileKey)
    expect(b).toEqual(a)
  })

  it.each([
    'https://www.instagram.com/studio_x?igsh=MWJ4b3Q1&utm_source=qr',
    'https://instagram.com/studio_x/',
    'http://m.instagram.com/STUDIO_X/?hl=en',
    'https://www.instagram.com/studio_x/#top',
    'instagram.com/studio_x',
    'www.instagram.com/studio_x',
    'Check out studio_x on Instagram https://www.instagram.com/studio_x?igsh=abc.',
    '  https://www.instagram.com/studio_x/  ',
  ])('reads Instagram from %j', (input) => {
    expect(parsed(input)).toEqual({
      ok: true,
      platform: 'instagram',
      handle: 'studio_x',
      profileUrl: 'https://www.instagram.com/studio_x/',
      profileKey: 'instagram:studio_x',
    })
  })

  it.each([
    'https://www.instagram.com/p/Cabc123/',
    'https://www.instagram.com/reel/Cabc123/',
    'https://www.instagram.com/stories/studio_x/123/',
    'https://www.instagram.com/',
    'https://www.instagram.com/explore/tags/wedding/',
  ])('rejects the Instagram link %j, which is not a profile', (input) => {
    expect(parseProfileUrl(input).ok).toBe(false)
  })

  it('reads a Facebook page, with fb.com mapped to facebook.com', () => {
    const expected = {
      ok: true,
      platform: 'facebook',
      handle: 'studio.x',
      profileUrl: 'https://www.facebook.com/studio.x',
      profileKey: 'facebook:studio.x',
    }
    expect(parsed('https://www.facebook.com/Studio.X?mibextid=abc')).toEqual(
      expected,
    )
    expect(parsed('https://m.facebook.com/studio.x/')).toEqual(expected)
    expect(parsed('https://fb.com/studio.x')).toEqual(expected)
  })

  it('reads a Facebook profile.php link by its numeric id', () => {
    expect(
      parsed(
        'https://www.facebook.com/profile.php?id=100012345678901&sk=about',
      ),
    ).toEqual({
      ok: true,
      platform: 'facebook',
      handle: '100012345678901',
      profileUrl: 'https://www.facebook.com/profile.php?id=100012345678901',
      profileKey: 'facebook:100012345678901',
    })
  })

  it.each([
    'https://www.facebook.com/share/p/1AbCdEf/',
    'https://www.facebook.com/groups/12345/',
    'https://www.facebook.com/profile.php',
    'https://www.facebook.com/',
  ])('rejects the Facebook link %j', (input) => {
    expect(parseProfileUrl(input).ok).toBe(false)
  })

  it('reads a TikTok profile and drops its tracking parameters', () => {
    expect(
      parsed(
        'https://www.tiktok.com/@Studio.X?_t=8abc&_r=1&utm_campaign=share&si=x',
      ),
    ).toEqual({
      ok: true,
      platform: 'tiktok',
      handle: 'studio.x',
      profileUrl: 'https://www.tiktok.com/@studio.x',
      profileKey: 'tiktok:studio.x',
    })
  })

  it('reads the profile from a TikTok video link and rejects other paths', () => {
    expect(
      parsed('https://www.tiktok.com/@studio.x/video/123').profileKey,
    ).toBe('tiktok:studio.x')
    expect(parseProfileUrl('https://www.tiktok.com/discover').ok).toBe(false)
  })

  it('reads a LinkedIn profile', () => {
    expect(
      parsed(
        'https://www.linkedin.com/in/Jane-Doe-12ab34/?utm_source=share&utm_medium=member_android',
      ),
    ).toEqual({
      ok: true,
      platform: 'linkedin',
      handle: 'jane-doe-12ab34',
      profileUrl: 'https://www.linkedin.com/in/jane-doe-12ab34/',
      profileKey: 'linkedin:jane-doe-12ab34',
    })
  })

  it('rejects a LinkedIn link that is not under /in/', () => {
    expect(parseProfileUrl('https://www.linkedin.com/feed/').ok).toBe(false)
    expect(parseProfileUrl('https://www.linkedin.com/in/').ok).toBe(false)
  })

  it('maps twitter.com to x.com', () => {
    const expected = {
      ok: true,
      platform: 'x',
      handle: 'studio_x',
      profileUrl: 'https://x.com/studio_x',
      profileKey: 'x:studio_x',
    }
    expect(parsed('https://twitter.com/Studio_X?s=20&t=abc')).toEqual(expected)
    expect(parsed('https://x.com/studio_x')).toEqual(expected)
    expect(parsed('https://mobile.twitter.com/studio_x/')).toEqual(expected)
  })

  it('rejects X links that are not profiles', () => {
    expect(parseProfileUrl('https://x.com/home').ok).toBe(false)
    expect(parseProfileUrl('https://x.com/').ok).toBe(false)
  })

  it('reads WhatsApp from wa.me, api.whatsapp.com and a phone number', () => {
    const expected = {
      ok: true,
      platform: 'whatsapp',
      handle: '94771234567',
      profileUrl: 'https://wa.me/94771234567',
      profileKey: 'whatsapp:94771234567',
    }
    expect(parsed('https://wa.me/94771234567?text=hi')).toEqual(expected)
    expect(
      parsed('https://api.whatsapp.com/send?phone=94771234567&text=hi'),
    ).toEqual(expected)
    expect(parsed('+94 77 123 4567')).toEqual(expected)
  })

  it('asks for a country code on a local phone number', () => {
    expect(parseProfileUrl('077 123 4567').ok).toBe(false)
    expect(parseProfileUrl('12345').ok).toBe(false)
  })

  it('turns an unknown host into other, keyed by the cleaned URL', () => {
    const a = parsed(
      'https://www.Example.com/portfolio/?utm_source=x&b=2&a=1#team',
    )
    expect(a).toEqual({
      ok: true,
      platform: 'other',
      handle: 'example.com/portfolio',
      profileUrl: 'https://example.com/portfolio?a=1&b=2',
      profileKey: 'other:example.com/portfolio?a=1&b=2',
    })
    expect(
      parsed('http://example.com/portfolio?a=1&b=2&fbclid=z').profileKey,
    ).toBe(a.profileKey)
  })

  it.each(['', '   ', 'hello there', 'not a url', 'ftp://example.com/x'])(
    'returns an error for %j',
    (input) => {
      const result = parseProfileUrl(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
    },
  )
})

describe('messageLink', () => {
  const base = { handle: 'studio_x', profileUrl: 'https://example.com/p' }

  it('uses ig.me for Instagram', () => {
    expect(messageLink({ ...base, platform: 'instagram' })).toBe(
      'https://ig.me/m/studio_x',
    )
  })

  it('uses m.me for Facebook', () => {
    expect(messageLink({ ...base, platform: 'facebook' })).toBe(
      'https://m.me/studio_x',
    )
  })

  it('puts the text in a WhatsApp link, encoded', () => {
    expect(
      messageLink(
        { ...base, platform: 'whatsapp', handle: '94771234567' },
        'Hi Jo & co',
      ),
    ).toBe('https://wa.me/94771234567?text=Hi%20Jo%20%26%20co')
    expect(
      messageLink({ ...base, platform: 'whatsapp', handle: '94771234567' }),
    ).toBe('https://wa.me/94771234567')
  })

  it.each(['tiktok', 'linkedin', 'x', 'other'] as const)(
    'opens the profile for %s',
    (platform) => {
      expect(messageLink({ ...base, platform }, 'hello')).toBe(base.profileUrl)
    },
  )
})
