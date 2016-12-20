<template>
<component v-bind:is="prefs.component" :config="prefs.config"></component>
</template>


<script>
import StandardTaskGrid from './Standard/StandardTaskGrid.vue'
/* global $ */
export default {
	data(){
		return {
			prefs: {}
		};
	},
	props: ["preferencesSelector"],
    components : {
    	StandardTaskGrid
    },
    computed: {
    },
    methods: {
    },
    created() {
    	this.prefs = JSON.parse($("." + this.preferencesSelector).html());
    }
};
</script>
