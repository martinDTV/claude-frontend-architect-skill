import 'server-only'
import moment from 'moment'
export function stamp() { return moment().toISOString() }
