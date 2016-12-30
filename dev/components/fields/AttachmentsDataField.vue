<template>
<span v-if="attachments > 0" class="attachments">
    <i :class="'fa fa-'+icon" aria-hidden="true"></i> {{attachments}}
</span>
</template>

<script>
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
.tasks>.task .title .attachments {
    color: #999;
    float: right;
    padding-left: 18px;
    padding-right: 12px;
}
</style>
