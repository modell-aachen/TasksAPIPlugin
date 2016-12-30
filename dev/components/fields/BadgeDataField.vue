<template>
<span :class="[config.class,'label','label-'+label]">
{{renderValue}}
</span>
</template>


<script>
/* global $ */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    data() {
        return {
            field: 'Type'
        };
    },
    computed: {
        label(){
            let value = this.task.fields[this.field].value;
            let output = 'info';
            $.each(this.config.labels, function( key, style) {
                if(value === key ) {
                    output = style;
                    return false;
                }
            });
            return output;
        },
        renderValue(){
            let field = this.task.fields[this.field];
            return field.displayValue ? field.displayValue : field.value;
        }
    }
};
</script>

<style lang="sass">
</style>
