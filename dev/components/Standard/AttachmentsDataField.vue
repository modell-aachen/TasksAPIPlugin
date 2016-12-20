<template>
<div>
    <i :class="'fa fa-'+icon" aria-hidden="true"></i> {{attachments}}
</div>
</template>

<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        attachments(){
            return this.task.attachments.length;
        },
        icon(){
            if(this.config.icon) {
                return this.config.icon;
            } else {
                return 'file';
            }
        }
    }
};
</script>

<style lang="sass">
</style>
