<template>
<span :class="[config.class,'label','label-'+config.class]">
    {{count}} / {{total}}
</span>
</template>


<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    data() {
        return {
            field: 'Type'
        };
    },
    computed: {
        count(){
            return '0';
            //return this.task.fields[this.field] || '0';
        },
        total(){
            return '0';
            //return this.task.fields[childTask] || '0';
        }
    }
};
</script>

<style lang="sass">
</style>
