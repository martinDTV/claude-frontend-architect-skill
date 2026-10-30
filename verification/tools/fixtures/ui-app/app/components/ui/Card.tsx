import { defineComponent } from 'vue'

export default defineComponent({
  name: 'Card',
  setup() {
    const open = () => {}
    return () => (
      <section>
        <img src="/cover.png" />
        <label htmlFor="q">Search</label>
        <input id="q" type="search" />
        <input type="text" placeholder="Unlabelled" />
        <div onClick={open}>Open</div>
        <button type="button" aria-label="Open details" onClick={open}><svg aria-hidden="true" /></button>
        <a href="/more" tabIndex={2}>More</a>
        <button type="button" onClick={open}><span>Open panel</span></button>
        <div onClick={(e) => e.stopPropagation()}><a href="/keep">Keep</a></div>
      </section>
    )
  },
})
