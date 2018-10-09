<template>
    <span :class="config.class" v-on:click.stop="updateStatus">
        <template v-if="!isClosed">
            <i class="fa fa-fw fa-square"></i>
        </template>
        <template v-else>
            <i class="cloased fa fa-fw fa-check-square"></i>
        </template>
    </span>
</template>

<script>
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
import MaketextMixin from '../../mixins/MaketextMixin.vue';
/* global swal */
export default {
    mixins: [DataFieldMixin, MaketextMixin],
    computed: {
        isClosed() {
            let field = this.config.field;
            let taskStatus = this.task.fields[field].value;
            return taskStatus === 'closed';
        }
    },
    methods: {
      updateStatus() {
        let self = this;
        let onLeaseTaken = function(){
            swal({
                title: self.maketext("Editing not possible."),
                text: self.maketext("This task is currently edited by another user. Please try again later."),
                type: "warning",
                confirmButtonColor: "#D83314",
                confirmButtonText: self.maketext("Confirm"),
                closeOnConfirm: true,
                allowEscapeKey: false
            });
        };
        let newStatus = 'closed';
        if (this.isClosed) {
            newStatus = 'open';
        }
        let request = {
            id: this.task.id,
            Status: newStatus,
        };
        this.$store.dispatch('updateTask', {gridState: this.gridState, request, onLeaseTaken});
      },
    }
};
</script>

<style lang="sass">
</style>
