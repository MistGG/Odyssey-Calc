import {

  useEffect,

  useId,

  useRef,

  useState,

  type CSSProperties,

  type ReactNode,

} from 'react'

import { createPortal } from 'react-dom'

import { NavLink, useLocation } from 'react-router-dom'



export type NavMenuItem = {

  to: string

  label: string

  end?: boolean

  className?: string

  isActive?: (pathname: string) => boolean

  state?: unknown

}



export type NavMenuGroupProps = {

  /** Label on the nav pill; clicking opens the menu. */

  triggerLabel: ReactNode

  /** All destinations, including the parent (e.g. Tier List + Changes). */

  items: NavMenuItem[]

  menuLabel: string

  groupClassName?: string

  /** Extra classes on the trigger pill (e.g. event / companion styling). */

  triggerClassName?: string

}



function itemActive(pathname: string, item: NavMenuItem): boolean {

  if (item.isActive) return item.isActive(pathname)

  if (item.end) return pathname === item.to

  return pathname === item.to || pathname.startsWith(`${item.to}/`)

}



export function NavMenuGroup({

  triggerLabel,

  items,

  menuLabel,

  groupClassName = '',

  triggerClassName = '',

}: NavMenuGroupProps) {

  const { pathname } = useLocation()

  const detailsRef = useRef<HTMLDetailsElement>(null)

  const summaryRef = useRef<HTMLElement>(null)

  const dropRef = useRef<HTMLDivElement>(null)

  const menuId = useId()

  const [menuOpen, setMenuOpen] = useState(false)

  const [dropStyle, setDropStyle] = useState<CSSProperties>({})



  const groupActive = items.some((item) => itemActive(pathname, item))



  const closeMenu = () => {

    if (detailsRef.current) detailsRef.current.open = false

    setMenuOpen(false)

  }



  const updateDropPosition = () => {

    const summary = summaryRef.current

    if (!summary) return

    const rect = summary.getBoundingClientRect()

    setDropStyle({

      position: 'fixed',

      top: rect.bottom + 6,

      left: rect.left,

      minWidth: Math.max(rect.width, 132),

    })

  }



  useEffect(() => {

    closeMenu()

  }, [pathname])



  useEffect(() => {

    const el = detailsRef.current

    if (!el) return



    const onToggle = () => {

      const open = el.open

      setMenuOpen(open)

      if (open) {

        requestAnimationFrame(() => {

          updateDropPosition()

          requestAnimationFrame(updateDropPosition)

        })

      }

    }



    el.addEventListener('toggle', onToggle)

    return () => el.removeEventListener('toggle', onToggle)

  }, [])



  useEffect(() => {

    if (!menuOpen) return



    const onLayout = () => updateDropPosition()

    window.addEventListener('resize', onLayout)

    window.addEventListener('scroll', onLayout, true)

    return () => {

      window.removeEventListener('resize', onLayout)

      window.removeEventListener('scroll', onLayout, true)

    }

  }, [menuOpen])



  useEffect(() => {

    if (!menuOpen) return



    const onDoc = (e: MouseEvent) => {

      const target = e.target as Node

      const el = detailsRef.current

      if (

        el?.open &&

        !el.contains(target) &&

        !dropRef.current?.contains(target)

      ) {

        closeMenu()

      }

    }



    document.addEventListener('click', onDoc)

    return () => document.removeEventListener('click', onDoc)

  }, [menuOpen])



  const dropMenu =

    menuOpen &&

    createPortal(

      <div

        ref={dropRef}

        id={menuId}

        className="nav-menu__drop nav-menu__drop--open"

        role="menu"

        style={dropStyle}

      >

        {items.map((item) => (

          <NavLink

            key={item.to}

            to={item.to}

            state={item.state}

            end={item.end}

            role="menuitem"

            className={({ isActive }) =>

              `nav-menu__item${item.className ? ` ${item.className}` : ''}${

                isActive ? ' nav-menu__item--active' : ''

              }`

            }

            onClick={closeMenu}

          >

            {item.label}

          </NavLink>

        ))}

      </div>,

      document.body,

    )



  return (

    <>

      <details

        ref={detailsRef}

        className={`nav-menu${groupActive ? ' nav-menu--active' : ''}${

          groupClassName ? ` ${groupClassName}` : ''

        }`}

      >

        <summary

          ref={summaryRef}

          className={`nav-menu__trigger nav-link${triggerClassName ? ` ${triggerClassName}` : ''}${

            groupActive ? ' nav-menu__trigger--active' : ''

          }`}

          aria-label={menuLabel}

          aria-controls={menuId}

          aria-expanded={menuOpen}

          aria-haspopup="menu"

        >

          <span className="nav-menu__label">{triggerLabel}</span>

          <span className="nav-menu__chev" aria-hidden />

        </summary>

      </details>

      {dropMenu}

    </>

  )

}


