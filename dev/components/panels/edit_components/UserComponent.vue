<template>
<vue-select label="text" placeholder="Placeholder" :options="options" :on-search="onSearch" :prevent-search-filter="true"  :on-selection-change="onSelectionChange" :on-open="onOpen"></vue-select>
</template>

<script>
/* global foswiki $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
import VueSelect from 'vue-select/src/index.js';
export default {
    mixins: [MetaFieldMixin],
    data() {
        return {
            options: [{text:"DUMMY"}],
        };
    },
    components: {
        VueSelect
    },
    methods: {
        onSearch(search, loading){
            this.fetchOptions(search, loading);
        },
        onOpen(search, loading){
            this.options = [];
            this.fetchOptions(search, loading)
        },
        onSelectionChange(selections){
            let result = "";
            for(let i = 0; i < selections.length; i++){
                result += selections[i].id;
                if(i != selections.length -1)
                    result += ",";
            }
            this.fields[this.fieldName].value = result;
        },
        fetchOptions(search, loading) {
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
    }
};
</script>

<style lang="sass">
</style>
