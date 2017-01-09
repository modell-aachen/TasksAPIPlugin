<template>
<div>
<vue-select v-bind:class="{'ma-failure': showValidationWarnings && !isValid}" v-bind:aria-describedby="id" :multiple="isMulti" label="id" :initial-value="initialOptions" placeholder="Placeholder" :options="options" :on-search="onSearch" :prevent-search-filter="true"  :on-change="onSelectionChange" :on-open="onOpen" :get-option-label="getOptionLabel"></vue-select>
<p v-show="showValidationWarnings && !isValid" class="help-text" v-bind:id="id">Mandatory!</p>
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
            initialOptions: null
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
        onSelectionChange(selections){
            let result = "";
            if(!Array.isArray(selections)){
                selections = [selections];
            }
            for(let i = 0; i < selections.length; i++){
                result += selections[i].id;
                if(i != selections.length -1)
                    result += ",";
            }
            this.fields[this.fieldName].value = result;
        },
        fetchOptions(search) {
            let start = this.options.length;
            let request = {
                skin: "text",
                contenttype: "text/plain",
                section: "select2::user",
                limit: 1,
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
            let initialOptions = [];
            let ids = this.fields[this.fieldName].value.split(/\s*,\s*/);
            let displayValues = this.fields[this.fieldName].displayValue.split(/\s*,\s*/);
            for(let i = 0; i < ids.length; i++){
                initialOptions.push({
                    id: ids[i],
                    text: displayValues[i]
                });
            }
            if(!this.isMulti)
                initialOptions = initialOptions[0];
            this.initialOptions = initialOptions;
    }
};
</script>

<style scoped lang="sass">
</style>
