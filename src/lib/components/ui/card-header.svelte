<script lang="ts">
  import { cn } from '@/lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="card-header"
  class={cn('flex flex-col gap-1.5 px-6', className)}
  {...restProps}
>
  {@render children?.()}
</div>