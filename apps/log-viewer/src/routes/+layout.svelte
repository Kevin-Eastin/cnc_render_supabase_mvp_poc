<!--
@file +layout.svelte
@description Root layout that loads global styles for the log viewer.
@role App shell for shared styling and layout.

@pseudocode
 1. Import the global CSS file.
 2. Render the current route.
 3. Keep layout minimal for flexibility.
 4. Provide consistent base styling.
-->

<script>
  import '../app.css';
</script>

<slot />
