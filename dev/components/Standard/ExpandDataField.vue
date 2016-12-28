<template>
    <span :class="config.class" v-on:click="updateStatus">
        <template v-if="!isExpanded">
            <i class="fa fa-fw fa-chevron-right"></i>
        </template>
        <template v-else>
            <i class="cloased fa fa-fw fa-chevron-down"></i>
        </template>
    </span>
</template>

<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        isExpanded() {
            let childRowStaus = 'closed';
            return childRowStaus === 'closed';
        }
    },
    methods: {
      updateStatus() {
          console.log("EXPAND");
      },
    }
};
</script>

<style lang="sass">
</style>
