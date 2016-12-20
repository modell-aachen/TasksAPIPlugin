<template>
<div :class="config.class + ' ' + label">
{{renderValue}}
</div>
</template>


<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        label(){
            let value = this.task.fields['Type'].value;
            $.each(this.config.labels, function( key, value ) {
                if(value === key ) {
                    return value;
                }
            });
        },
        renderValue(){
            let field = this.task.fields['Type'];
            return field.displayValue ? field.displayValue : field.value;
        }
    }
};
</script>

<style lang="sass">
</style>
