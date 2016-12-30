<template>
    <span :class="config.class" v-on:click="updateStatus">
        <template v-if="!isClosed">
            <i class="fa fa-fw fa-square-o"></i>
        </template>
        <template v-else>
            <i class="cloased fa fa-fw fa-check-square"></i>
        </template>
    </span>
</template>

<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        isClosed() {
            let field = this.config.field;
            let taskStatus = this.task.fields[field].value;
            return taskStatus === 'closed';
        }
    },
    methods: {
      updateStatus() {
        let newStatus = 'closed';
        if (this.isClosed) {
            newStatus = 'open';
        }
        let request = {
            id: this.task.id,
            Status: newStatus,
        };
        this.$store.dispatch('updateTask', {gridState: this.gridState, request});
      },
    }
};
</script>

<style lang="sass">
</style>
