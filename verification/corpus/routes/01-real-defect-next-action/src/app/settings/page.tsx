import { updateEmail } from './actions'

export default function SettingsPage() {
  return (
    <form action={updateEmail}>
      <input name="email" type="email" />
      <button type="submit">Save</button>
    </form>
  )
}
