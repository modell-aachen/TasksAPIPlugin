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
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        isExpanded() {
            return this.$parent.showChildren;
        }
    },
    methods: {
      updateStatus() {
          this.$parent.showChildren = !this.isExpanded;
      },
    }
};
</script>

<style lang="sass">
</style>
