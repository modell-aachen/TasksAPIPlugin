<template>
<div v-if="!sameContext(config.target)">
    <a :href="getLink(config.target)">{{getDisplayValue(config.display)}}</a>
</div>
</template>

<script>
/* global moment foswiki */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    methods: {
        sameContext(field) {
            let actualSite = foswiki.preferences.WEB +"."+ foswiki.preferences.TOPIC;
            let taskContext = this.task.fields[field].value;
            return actualSite === taskContext;
        },
        getLink(field) {
            let path = foswiki.preferences.SCRIPTURL;
            let taskContext = this.task.fields[field];
            return path + '/view/' + taskContext.value;
        },
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
