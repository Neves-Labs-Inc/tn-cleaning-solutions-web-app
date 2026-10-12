'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { browserListStorage, listReturnHref } from '@/lib/appointments/list-return'
import { APPOINTMENTS_PATH } from '@/lib/appointments/overview'

type AppointmentsReturnLinkProps = Omit<React.ComponentProps<typeof Link>, 'href'>

function readReturnHref(): string {
  return listReturnHref(browserListStorage())
}

// A link to the appointments list that lands on its last state. The bare href renders on the server
// and first paint (no hydration mismatch); the remembered one is read after mount and on hover/focus,
// so modified clicks and "copy link" use it too.
export function AppointmentsReturnLink({
  onClick,
  onPointerEnter,
  onFocus,
  ...rest
}: AppointmentsReturnLinkProps) {
  const router = useRouter()
  const [href, setHref] = useState(APPOINTMENTS_PATH)

  useEffect(() => {
    // sessionStorage only exists in the browser, so it can't seed the initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(readReturnHref())
  }, [])

  function handlePointerEnter(event: React.PointerEvent<HTMLAnchorElement>) {
    setHref(readReturnHref())
    onPointerEnter?.(event)
  }

  function handleFocus(event: React.FocusEvent<HTMLAnchorElement>) {
    setHref(readReturnHref())
    onFocus?.(event)
  }

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const fresh = readReturnHref()
    const isPlainClick =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    // The list may have changed since the last hover; the browser would follow the stale href.
    if (isPlainClick && fresh !== href) {
      event.preventDefault()
      router.push(fresh)
    }
    onClick?.(event)
  }

  return (
    <Link
      {...rest}
      href={href}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
    />
  )
}
