'use client'

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "./input"

interface PasswordInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  showToggle?: boolean
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showToggle = true, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)

    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    // A form reset (e.g. after a successful password change) must hide the password again.
    React.useEffect(() => {
      const form = innerRef.current?.form
      if (!form) return
      const handleReset = () => setShowPassword(false)
      form.addEventListener('reset', handleReset)
      return () => form.removeEventListener('reset', handleReset)
    }, [])

    const togglePasswordVisibility = () => {
      setShowPassword((prev) => !prev)
    }

    return (
      <div className="relative">
        <Input
          ref={innerRef}
          type={showPassword ? 'text' : 'password'}
          className={cn(showToggle && 'pr-11', className)}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            onClick={togglePasswordVisibility}
            onMouseDown={(e) => {
              e.preventDefault()
            }}
            className="cursor-pointer absolute inset-y-0 right-0 z-20 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast md:hover:text-foreground active:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    )
  }
)

PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
