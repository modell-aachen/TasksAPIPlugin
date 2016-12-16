<template>
<div>
{{renderValue}}
</div>
</template>


<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    props: ["field"],
    computed: {
        renderValue(){
            let field = this.task.fields[this.field];
            switch(field.type){
                case 'date2':
                    if(!field.value)
                        return "";
                    return moment.unix(parseInt(field.value)).toDate().toLocaleDateString();
                default:
                    return field.displayValue ? field.displayValue : field.value;
            }
        }
    }
};
</script>

<style lang="sass">
</style>
