<template>
    <div :class="config.class">
        <span v-for="field in config.fields">
            {{getDisplayValue(field)}}
        </span>
    </div>
</template>

<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    methods: {
        getDisplayValue(field){
            let taskField = this.task.fields[field];
            switch(taskField.type){
                case 'date2':
                    if(!taskField.value)
                        return "";
                    return moment.unix(parseInt(taskField.value)).toDate().toLocaleDateString();
                default:
                    return taskField.displayValue ? taskField.displayValue : taskField.value;
            }
        }
    }
};
</script>

<style lang="sass">
</style>
