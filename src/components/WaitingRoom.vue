<script setup lang="ts">
defineProps<{ offline: boolean }>()
const mascot = import.meta.env.BASE_URL + 'pilze/pilz-peek.webp'
</script>

<template>
  <section class="waiting">
    <div class="waiting-art" aria-hidden="true">
      <img :src="mascot" alt="" width="256" height="256">
      <span class="tablet"><i></i></span>
    </div>
    <div class="waiting-copy">
      <template v-if="offline">
        <p class="eyebrow">Stream offline</p>
        <h2>Bis zum nächsten Stream</h2>
        <p>Sobald Robin live ist, kannst du hier GIFs und Pilze schicken.</p>
      </template>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.waiting { display:grid; align-content:center; justify-items:center; gap:clamp(18px,4vh,36px); min-height:max(280px, calc(100svh - 145px)); padding:24px 16px; text-align:center; background:radial-gradient(ellipse at 50% 41%, #2d2443, transparent 60%), radial-gradient(#263242 1px,transparent 1px) center/18px 18px,#0b1016; }
.waiting-art { position:relative; width:min(84%,30vh,245px); aspect-ratio:1; filter:drop-shadow(0 10px 14px #05070aa6); }
.waiting-art img { width:100%;height:100%;object-fit:contain; }
.tablet { position:absolute;top:84%;left:13%;width:74%;height:24%;background:linear-gradient(130deg,#526371,#1b2531 58%);border:2px solid #92a5ae;border-bottom:4px solid #0a1017;border-radius:7px;transform:perspective(180px) rotateX(-12deg);box-shadow:0 3px 10px #090b12; }
.tablet i { position:absolute;left:8%;top:18%;width:5px;height:5px;background:#4fe3b0;border-radius:50%;animation:pulse 3s ease-in-out infinite alternate; }
.waiting-copy { display:grid;justify-items:center;gap:8px;max-width:32ch;color:var(--soft);line-height:1.45; }
h2 { font-size:clamp(1.25rem,5vw,1.75rem);color:var(--ink);line-height:1.1; }
@keyframes pulse { to {opacity:.35} }
@media (prefers-reduced-motion:reduce){ .tablet i {animation:none} }
@media(max-height:390px) and (min-width:360px){.waiting{min-height:150px;grid-template-columns:1fr 1.4fr;align-items:center;padding:12px}.waiting-art{width:min(120px,95%)}}
</style>
