<script lang="ts">
import type { IconSvgElement } from "@hugeicons/svelte";
import { HugeiconsIcon } from "@hugeicons/svelte";

interface Props {
	icon: IconSvgElement;
	title: string;
	description: string;
}

let { icon, title, description }: Props = $props();
</script>

<div class="mh-empty-state px-4 py-10 text-center" data-empty-state>
	<!-- Keep this semantic icon slot in every empty state. Its fixed 20px line
	     plus 12px gap prevents the popup shell from moving between tabs. -->
	<div
		class="mx-auto mb-3 flex h-5 items-center justify-center text-muted-foreground"
		aria-hidden="true"
		data-empty-state-icon
	>
		<HugeiconsIcon icon={icon} strokeWidth={2} class="size-5" />
	</div>
	<p class="text-sm font-medium">{title}</p>
	<p class="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
		{description}
	</p>
</div>
