<template>
<div>
<vue-select v-show="!isAutoAssigned" v-model="selectedValues" v-bind:class="{'ma-failure': showValidationWarnings && !isValid}" v-bind:aria-describedby="id" :multiple="isMulti" label="id" :placeholder="maketext('Search')" :options="options" :on-search="onSearch" :prevent-search-filter="true" :on-open="onOpen" :get-option-label="getOptionLabel"></vue-select>
<p v-show="showValidationWarnings && !isValid" class="help-text" v-bind:id="id">{{maketext("This field is mandatory")}}</p>
<div v-show="isAutoAssigned" class="autoassigned-value">
{{this.fields[this.fieldName].value}}
</div>
</div>
</template>

<script>
/* global foswiki $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
import VueSelect from 'vue-select/src/index.js';
export default {
    mixins: [MetaFieldMixin],
    data() {
        return {
            options: [],
            selectedValues: []
        };
    },
    components: {
        VueSelect
    },
    computed: {
        isMulti() {
            return this.fields[this.fieldName].multi;
        }
    },
    watch: {
        selectedValues(){
            if(!this.selectedValues)
                return;
            let result = "";
            if(!Array.isArray(this.selectedValues)){
                this.selectedValues = [this.selectedValues];
            }
            for(let i = 0; i < this.selectedValues.length; i++){
                result += this.selectedValues[i].id;
                if(i != this.selectedValues.length -1)
                    result += ",";
            }
            this.fields[this.fieldName].value = result;
        },
        isAutoAssigned(isAssigned, wasAssigned){
            if(wasAssigned && !isAssigned){
                this.selectedValues = [];
                this.showValidationWarnings = false;
            }
        }
    },
    methods: {
        onSearch(search, loading){
            this.fetchOptions(search, loading);
        },
        onOpen(search, loading){
            this.options = [];
            this.fetchOptions(search, loading);
        },
        getOptionLabel: function(option){
            return option.text;
        },
        fetchOptions(search) {
            let start = this.options.length;
            let request = {
                skin: "text",
                contenttype: "text/plain",
                section: "select2::user",
                limit: 10,
                start: start,
                q: search
            };

            let self = this;
            $.get(foswiki.preferences.SCRIPTURLPATH + "/System/MoreFormfieldsAjaxHelper", request, (data) => {
                self.options = data.results;
            }, "json");
        }
    },
    created(){
        if(!this.fields[this.fieldName].value){
                return null;
        }
        let selectedValues = [];
        let ids = this.fields[this.fieldName].value.split(/\s*,\s*/);
        let displayValues = null;
        if(this.fields[this.fieldName].displayValue){
            displayValues = this.fields[this.fieldName].displayValue.split(/\s*,\s*/);
        }
        else {
            displayValues = ids;
        }

        for(let i = 0; i < ids.length; i++){
            selectedValues.push({
                id: ids[i],
                text: displayValues[i]
            });
        }
        this.selectedValues = selectedValues;
    }
};
</script>

<style scoped lang="sass">
.autoassigned-value {
    margin: 0 0 1rem;
}
</style>
