<template>
    <component v-bind:is="prefs.component+'-task-grid'" :config="prefs.config"></component>
</template>

<script>
import StandardTaskGrid from './grids/StandardTaskGrid.vue';
/* global $ */
export default {
    data(){
        return {
            prefs: {}
        };
    },
    props: ["preferencesSelector"],
    components : {
        StandardTaskGrid,
    },
    created() {
        this.prefs = JSON.parse($("." + this.preferencesSelector).html());
    }
};
</script>
