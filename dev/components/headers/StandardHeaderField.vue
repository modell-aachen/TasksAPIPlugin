<template>
    <div>
        <div v-if="field" v-on:click="sort" class="header">
            <b>{{title}}</b>
            <i :class="'fa fa-'+ sortingIconClass" aria-hidden="true"></i>
        </div>
        <div v-else  class="header">
            <b>{{title}}</b>
        </div>
    </div>
</template>

<script>
export default {
    mixins: [],
    props: ["gridState", "title", "field", "parentTask"],
    computed: {
        sortState() {
            return this.gridState.sortState;
        },
        sortingIconClass() {
            if(this.gridState.sortState.field === this.field) {
                if(this.gridState.sortState.descending) {
                    return 'caret-down';
                }else{
                    return 'caret-up';
                }
            } else {
                return 'sort';
            }
        }
    },
    methods: {
        sort() {
            let newSortState = {
                field: this.field,
                descending: false
            };
            if(this.sortState.field === this.field){
                newSortState.descending = !this.sortState.descending;
            }
            this.$store.dispatch('changeSortState', {
                gridState: this.gridState,
                newSortState,
                parentTask: this.parentTask
            });
        }
    }
};
</script>
<style lang="sass">
.header {
    color: #999;
    font-size: 11px;
    text-align: left;
    text-transform: uppercase;
    i {
        color: #999;
        font-size: 11px;
    }
}
</style>
