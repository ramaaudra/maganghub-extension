<script lang="ts">
  import { cn } from '@/lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-title" class={cn('text-base font-medium leading-none', className)} {...restProps}>
  {@render children?.()}
</div>