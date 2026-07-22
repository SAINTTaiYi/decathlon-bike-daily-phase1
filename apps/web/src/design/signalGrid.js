import OverviewOutline from '@iconoir/Reports.mjs'
import OverviewFilled from '@iconoir-solid/Reports.mjs'
import PickupOutline from '@iconoir/CalendarCheck.mjs'
import PickupFilled from '@iconoir-solid/CalendarCheck.mjs'
import OtherOutline from '@iconoir/Book.mjs'
import OtherFilled from '@iconoir-solid/Book.mjs'
import RepairOutline from '@iconoir/FrameTool.mjs'
import RepairFilled from '@iconoir-solid/FrameTool.mjs'
import ResaleOutline from '@iconoir/Label.mjs'
import ResaleFilled from '@iconoir-solid/Label.mjs'
import SalesOutline from '@iconoir/Cash.mjs'
import SalesFilled from '@iconoir-solid/Cash.mjs'
import ClosingOutline from '@iconoir/DatabaseCheck.mjs'
import ClosingFilled from '@iconoir-solid/DatabaseCheck.mjs'

export const SIGNAL_ICON_STROKE = 1.75

export const signalGridIconRules = Object.freeze({
  navigation: Object.freeze({ variant: 'outline', strokeWidth: SIGNAL_ICON_STROKE }),
  navigationActive: Object.freeze({ variant: 'filled' }),
  ordinaryAction: Object.freeze({ variant: 'outline', strokeWidth: SIGNAL_ICON_STROKE }),
  primaryAction: Object.freeze({ variant: 'filled' }),
  semanticStatus: Object.freeze({ variant: 'filled' }),
  destructiveAction: Object.freeze({ variant: 'filled' })
})

const moduleTheme = (id, name, token, icon, activeIcon, options = {}) => Object.freeze({
  id,
  name,
  token,
  signalToken: options.signalToken || token,
  foregroundToken: options.foregroundToken || '--sg-p-color-ink',
  neutralStructure: Boolean(options.neutralStructure),
  icon,
  activeIcon
})

export const signalGridModules = Object.freeze({
  overview: moduleTheme('overview', 'Voltage Lime', '--sg-p-module-overview', OverviewOutline, OverviewFilled),
  pickup: moduleTheme('pickup', 'Solar Yellow', '--sg-p-module-pickup', PickupOutline, PickupFilled),
  other: moduleTheme('other', 'Cool White + Voltage Lime', '--sg-p-color-surface', OtherOutline, OtherFilled, {
    signalToken: '--sg-p-module-overview',
    neutralStructure: true
  }),
  repair: moduleTheme('repair', 'Ion Cyan', '--sg-p-module-repair', RepairOutline, RepairFilled),
  resale: moduleTheme('resale', 'Hot Magenta', '--sg-p-module-resale', ResaleOutline, ResaleFilled),
  sales: moduleTheme('sales', 'Plasma Violet', '--sg-p-module-sales', SalesOutline, SalesFilled, {
    foregroundToken: '--sg-p-color-surface'
  }),
  closing: moduleTheme('closing', 'Blaze Orange', '--sg-p-module-closing', ClosingOutline, ClosingFilled)
})
