import { createFluentVue } from 'fluent-vue'
import type { FluentDateTime, FluentValue } from '@fluent/bundle'
import { FluentBundle, FluentResource } from '@fluent/bundle'

import type { UseTimeAgoOptions } from '@vueuse/core'
import { defaultLocale, locale, locales } from '~/config/i18n'
import { COOKIE_KEY_LOCALE, COOKIE_MAX_AGE } from '~/constants'

import defaultMessages from '~/locales/en-US.ftl?raw'

function format(bundle: FluentBundle, key: string, agrs?: any) {
  const msg = bundle.getMessage(key)
  if (!msg)
    console.warn(`Message ${key} not found`)

  const errors: Error[] = []
  const value = bundle.formatPattern(msg?.value || '', agrs, errors)

  if (errors.length)
    console.warn(`Message ${key} has errors:`, errors)

  return value
}

function useTimeAgoOptions(short: boolean, bundle: FluentBundle): UseTimeAgoOptions<false> {
  const prefix = short ? 'short_' : ''

  const fn = (n: number, past: boolean, key: string) => {
    return format(bundle, `time_ago_options_${prefix}${key}_${past ? 'past' : 'future'}`, { n })
  }

  return {
    rounding: 'floor',
    showSecond: !short,
    updateInterval: short ? 60000 : 1000,
    messages: {
      justNow: format(bundle, 'time_ago_options_just_now'),
      // just return the value
      past: n => n,
      // just return the value
      future: n => n,
      second: (n, p) => fn(n, p, 'second'),
      minute: (n, p) => fn(n, p, 'minute'),
      hour: (n, p) => fn(n, p, 'hour'),
      day: (n, p) => fn(n, p, 'day'),
      week: (n, p) => fn(n, p, 'week'),
      month: (n, p) => fn(n, p, 'month'),
      year: (n, p) => fn(n, p, 'year'),
      invalid: '',
    },
    fullDateFormatter(date) {
      const options: Intl.DateTimeFormatOptions = short
        ? {
            dateStyle: 'short',
            timeStyle: 'short',
          }
        : {
            dateStyle: 'long',
            timeStyle: 'medium',
          }

      const intl = new Intl.DateTimeFormat(locale.value, options)

      return intl.format(date)
    },
  }
}

export function getDefaultBundle(): FluentBundle {
  const bundle: FluentBundle = new FluentBundle(defaultLocale, {
    functions: {
      DATE: (params: FluentValue[]) => {
        const dateValue = params[0] as FluentDateTime
        const date = new Date(dateValue.value)

        const format = params[1].valueOf() || 'short'

        if (format === 'short')
          return useTimeAgoOptions(true, bundle).fullDateFormatter!(date)
        else if (format === 'long')
          return useTimeAgoOptions(true, bundle).fullDateFormatter!(date)

        return useTimeAgo(date, useTimeAgoOptions(false, bundle)).value
      },
    },
  })

  bundle.addResource(new FluentResource(defaultMessages))

  return bundle
}

export async function getBundle(locale: string): Promise<FluentBundle> {
  const { default: messages } = await import(`../locales/${locale}.ftl?raw`)

  // TODO: Customize functions
  const bundle = new FluentBundle(locale)
  bundle.addResource(new FluentResource(messages))

  return bundle
}

const fluent = createFluentVue({
  bundles: [
    getDefaultBundle(),
  ],
})

async function setLocale(newLocale: string) {
  locale.value = newLocale

  const bundle = await getBundle(newLocale)

  // Locale changed while loading the new bundle
  if (locale.value !== newLocale)
    return

  fluent.bundles = [bundle]
}

export default defineNuxtPlugin(async (nuxt) => {
  nuxt.vueApp.use(fluent)

  const cookieLocale = useCookie(COOKIE_KEY_LOCALE, { maxAge: COOKIE_MAX_AGE })
  const isFirstVisit = cookieLocale.value == null

  if (process.client && isFirstVisit) {
    const userLang = (navigator.language || 'en-US').toLowerCase()
    const lang = locales.find(locale => userLang.startsWith(locale.code.toLowerCase()))?.code
      || locales.find(locale => userLang.startsWith(locale.code.split('-')[0]))?.code
    cookieLocale.value = lang || 'en-US'
  }

  if (cookieLocale.value && cookieLocale.value !== locale.value) {
    const fixSSRsetLocale = setLocale

    await fixSSRsetLocale(cookieLocale.value)
  }

  if (process.client) {
    watch(locale, async () => {
      cookieLocale.value = locale.value

      await setLocale(locale.value)
    })
  }
})
