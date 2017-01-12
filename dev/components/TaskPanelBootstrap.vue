<template>
    <component v-bind:is="prefs.component+'-task-panel'" :config="prefs.config"></component>
</template>

<script>
import StandardTaskPanel from './panels/StandardTaskPanel.vue';
/* global $ */
export default {
    data(){
        return {
            prefs: {}
        };
    },
    props: ["preferencesSelector"],
    components : {
        StandardTaskPanel,
    },
    created() {
        this.prefs = JSON.parse($("." + this.preferencesSelector).html());
    }
};
</script>
