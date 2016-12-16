<template>
<div v-on:click="sort"><b>{{title}}</b></div>
</template>


<script>
/* global moment */
import * as mutations from '../../store/mutation-types.js';
export default {
    mixins: [],
    props: ["gridState", "title", "field"],
    computed: {
    	sortState() {
    		return this.gridState.sortState;
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
    		this.$store.commit(mutations.CHANGE_SORT, {gridState: this.gridState, newSortState});
    	}
    }
};
</script>
</style>
