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
            //TBD
            return '0';
        },
        total(){
            if(this.task.children && this.task.children[0] != "") {
                return this.task.children.length;
            } else {
                return '0';
            }
        }
    }
};
</script>

<style lang="sass">
</style>
