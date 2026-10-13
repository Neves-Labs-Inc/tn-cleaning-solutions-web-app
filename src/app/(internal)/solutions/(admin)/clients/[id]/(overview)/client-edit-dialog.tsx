'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { ClientForm } from '@/components/admin/client-form'
import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import ResponsiveDialog from '@/components/ui/responsive-dialog'

type ClientEditDialogProps = {
  client: {
    id: string
    name: string
    email: string | null
    phone: string | null
    notes: string | null
    is_active: boolean
  }
}

// The header's Edit client button and the dialog it opens.
export function ClientEditDialog({ client }: ClientEditDialogProps): React.ReactNode {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  function handleSuccess(): void {
    setIsOpen(false)
    toast.success('Client saved')
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" className={OUTLINE_PRESS_CLASS_NAME} onClick={() => setIsOpen(true)}>
        <Pencil aria-hidden="true" data-icon="inline-start" />
        Edit client
      </Button>
      <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen} title="Edit client" isPending={isPending}>
        <ClientForm
          client={client}
          dialog={{ onSuccess: handleSuccess, onCancel: () => setIsOpen(false), onPendingChange: setIsPending }}
        />
      </ResponsiveDialog>
    </>
  )
}
