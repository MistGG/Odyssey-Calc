import { useEffect, useRef, useState, type RefObject } from 'react'

type UseWhenVisibleOptions = {
  /** Start loading slightly before the element enters the viewport. */
  rootMargin?: string
  threshold?: number
}

/**
 * Fires once when the ref element intersects the viewport (or root).
 * `visible` stays true after the first intersection.
 */
export function useWhenVisible<T extends Element>(
  options: UseWhenVisibleOptions = {},
): { ref: RefObject<T | null>; visible: boolean } {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: options.rootMargin ?? '160px 0px',
        threshold: options.threshold ?? 0,
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, options.rootMargin, options.threshold])

  return { ref, visible }
}
