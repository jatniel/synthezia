import synthezia_logo from "../assets/synthezia-black.png"
import synthezia_thumb from "../assets/synthezia-black-logo.png"
import { useEffect, useState } from "react";


export function SyntheziaLogo({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  const clickable = typeof onClick === 'function'
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640)

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 640)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])


  return (
    <div className={`${className}`}>
      <img
      
        src={isSmallScreen ? synthezia_thumb : synthezia_logo}
        alt="SynthezIA Logo"
        className={`h-8 sm:h-10 w-auto select-none ${clickable ? 'cursor-pointer hover:opacity-90 focus:opacity-90 outline-none' : ''}`}
        role={clickable ? 'button' as const : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!clickable) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
          }
        }}
      />
    </div>
  )
}
