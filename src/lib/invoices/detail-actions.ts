import type { InvoiceAction } from './transitions.ts'

// The detail page's buttons. 'edit' isn't a button: it makes the draft's lines and details editable.
export type DetailAction = Exclude<InvoiceAction, 'edit'>

export type ActionLayout = {
  // The phone bar's one size="lg" button.
  primary: DetailAction | null
  // The phone bar's More sheet, top to bottom.
  more: DetailAction[]
  // The desktop header, left to right; the primary sits last.
  desktop: DetailAction[]
}

// The first allowed one is the primary: the step that moves the invoice forward.
const PRIMARY_ORDER: readonly DetailAction[] = ['issue', 'recordPayment', 'editPayment', 'unarchive', 'archive']
const MORE_ORDER: readonly DetailAction[] = ['undoPayment', 'void', 'archive']
// Destructive first, then the quieter outline actions, so the primary ends the row.
const DESKTOP_ORDER: readonly DetailAction[] = ['void', 'undoPayment', 'archive']

export function actionLayout(allowed: ReadonlySet<InvoiceAction>): ActionLayout {
  const primary = PRIMARY_ORDER.find((action) => allowed.has(action)) ?? null
  const secondary = (order: readonly DetailAction[]) =>
    order.filter((action) => action !== primary && allowed.has(action))

  return {
    primary,
    more: secondary(MORE_ORDER),
    desktop: primary ? [...secondary(DESKTOP_ORDER), primary] : secondary(DESKTOP_ORDER),
  }
}
